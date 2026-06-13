'use strict';

/**
 * 약체크 YakCheck — 백엔드 서버 v2.0
 * Node.js ≥18 / Express 5
 *
 * 환경변수:
 *   DRUG_API_KEY    식약처 공공데이터포털 서비스키 (없으면 DEMO 모드)
 *   PORT            서버 포트 (기본 3000)
 *   ML_SERVICE_URL  ML 마이크로서비스 URL (기본 http://localhost:8001/predict)
 *   ML_TIMEOUT_MS   ML 요청 타임아웃 ms (기본 5000)
 *
 * API 엔드포인트:
 *   GET  /health                     서버·DUR 상태 확인
 *   GET  /api/drugs/search?q=약이름  식약처 약물 검색 (성분코드 포함)
 *   POST /api/interactions/analyze   DUR 룰 + ML 상호작용 분석
 */

require('dotenv').config();
const express = require('express');
const axios   = require('axios');
const cors    = require('cors');
const path    = require('path');
const fs      = require('fs');

// ─────────────────────────────────────────────────────────────────────────────
// §1. 상수 — 단일 참조 (출처 주석 포함, 수정은 여기서만)
// ─────────────────────────────────────────────────────────────────────────────
const PORT            = parseInt(process.env.PORT            ?? '3000',  10);
const ML_URL          = process.env.ML_SERVICE_URL           ?? 'http://localhost:8001/predict';
const ML_TIMEOUT_MS   = parseInt(process.env.ML_TIMEOUT_MS  ?? '5000',  10);  // SLA: ML ≤100ms 추론 + 버퍼
const DRUG_API_KEY    = process.env.DRUG_API_KEY             ?? '';
const DEMO_MODE       = !DRUG_API_KEY;

const MFDS_BASE         = 'https://apis.data.go.kr/1471000';
const MFDS_DUR_SEARCH   = `${MFDS_BASE}/DURPrdlstInfoService03/getDURPrdlstInfoList2`;
const MFDS_DUR_COMBO    = `${MFDS_BASE}/DURPrdlstInfoService03/getUsjntTabooInfoList3`;
const SEARCH_TIMEOUT_MS = 5000;   // 식약처 API 타임아웃 ms
const MAX_DRUGS         = 10;     // 최대 약 수 — design-spec §3 기준
const SEARCH_LIMIT      = 7;      // 드롭다운 최대 항목 — design-spec §2 기준
const SEARCH_CACHE_TTL  = 300_000; // 검색 캐시 TTL ms (5분)
const DUR_PAGE_SIZE     = 100;    // 식약처 API 페이지당 건수

// DUR 유형 코드 → 위험도 (AI 엔지니어 확정 스펙 2026-06-13)
const DUR_TYPE_TO_LEVEL = Object.freeze({
  '1': 'forbidden', // 병용금기
  '2': 'danger',    // 용량주의
  '3': 'danger',    // 임부금기
  '4': 'caution',   // 노인주의
  '5': 'caution',   // 연령금기
});

// DUR 유형 코드 → durBasis (AI 엔지니어 합의)
const DUR_TYPE_TO_BASIS = Object.freeze({
  '1': 'COMBO_TABOO',
  '2': 'DOSE_CAUTION',
  '3': 'PREG_TABOO',
  '4': 'ELDERLY_CAUTION',
  '5': 'AGE_TABOO',
});

// 위험도 → 한국어 레이블 (explanation 생성용)
const LEVEL_LABEL = Object.freeze({
  forbidden: '병용금기',
  danger:    '위험',
  caution:   '주의',
  safe:      '안전',
});

// 위험도 우선순위 (최고 위험 원칙 — design-spec §4 Screen4)
const LEVEL_PRIORITY = Object.freeze({ safe: 0, caution: 1, danger: 2, forbidden: 3 });

// ML 불응 폴백 confidence (AI 엔지니어 합의)
const ML_CONFIDENCE_FALLBACK = 0.0;


// ─────────────────────────────────────────────────────────────────────────────
// §2. 인메모리 캐시 (외부 의존 없음)
// ─────────────────────────────────────────────────────────────────────────────
class TimedCache {
  constructor(ttlMs) { this._store = new Map(); this._ttl = ttlMs; }
  get(key) {
    const e = this._store.get(key);
    if (!e) return undefined;
    if (Date.now() > e.exp) { this._store.delete(key); return undefined; }
    return e.val;
  }
  set(key, val) { this._store.set(key, { val, exp: Date.now() + this._ttl }); return val; }
  clear() { this._store.clear(); }
}
const searchCache = new TimedCache(SEARCH_CACHE_TTL);


// ─────────────────────────────────────────────────────────────────────────────
// §3. Demo 데이터 (API 키 없을 때 폴백 · 프론트 개발 지원)
// ─────────────────────────────────────────────────────────────────────────────

// Demo 약물 DB — 식약처 성분코드 체계 모사 (C1xxxxx)
const DEMO_DRUGS = [
  { itemSeq:'200000001', drugName:'타이레놀정500밀리그람',        company:'한국얀센',       form:'정제',   ingredients:[{ code:'C100001', name:'아세트아미노펜' }] },
  { itemSeq:'200000002', drugName:'아스피린프로텍트정100밀리그람', company:'바이엘코리아',   form:'장용정', ingredients:[{ code:'C100002', name:'아스피린(아세틸살리실산)' }] },
  { itemSeq:'200000003', drugName:'오메프라졸캡슐20밀리그람',      company:'아스트라제네카', form:'캡슐',   ingredients:[{ code:'C100003', name:'오메프라졸' }] },
  { itemSeq:'200000004', drugName:'이부프로펜정400밀리그람',        company:'동아제약',       form:'정제',   ingredients:[{ code:'C100004', name:'이부프로펜' }] },
  { itemSeq:'200000005', drugName:'메트포르민염산염정500밀리그람',  company:'동아에스티',     form:'정제',   ingredients:[{ code:'C100005', name:'메트포르민염산염' }] },
  { itemSeq:'200000006', drugName:'와파린나트륨정5밀리그람',        company:'명인제약',       form:'정제',   ingredients:[{ code:'C100006', name:'와파린나트륨' }] },
  { itemSeq:'200000007', drugName:'디곡신정0.25밀리그람',           company:'동화약품',       form:'정제',   ingredients:[{ code:'C100007', name:'디곡신' }] },
  { itemSeq:'200000008', drugName:'탄산리튬정300밀리그람',          company:'삼성제약',       form:'정제',   ingredients:[{ code:'C100008', name:'탄산리튬' }] },
  { itemSeq:'200000009', drugName:'클로피도그렐정75밀리그람',       company:'사노피',         form:'정제',   ingredients:[{ code:'C100009', name:'클로피도그렐황산염' }] },
  { itemSeq:'200000010', drugName:'암로디핀베실산염정5밀리그람',    company:'화이자',         form:'정제',   ingredients:[{ code:'C100010', name:'암로디핀베실산염' }] },
  { itemSeq:'200000011', drugName:'세티리진염산염정10밀리그람',     company:'한국UCB',        form:'정제',   ingredients:[{ code:'C100011', name:'세티리진염산염' }] },
  { itemSeq:'200000012', drugName:'레보티록신나트륨정100mcg',       company:'한국UCB',        form:'정제',   ingredients:[{ code:'C100012', name:'레보티록신나트륨' }] },
  { itemSeq:'200000013', drugName:'아토르바스타틴칼슘정20밀리그람', company:'화이자',         form:'정제',   ingredients:[{ code:'C100013', name:'아토르바스타틴칼슘삼수화물' }] },
  { itemSeq:'200000014', drugName:'심바스타틴정20밀리그람',         company:'한국MSD',        form:'정제',   ingredients:[{ code:'C100014', name:'심바스타틴' }] },
  { itemSeq:'200000015', drugName:'아미오다론염산염정200밀리그람',  company:'사노피',         form:'정제',   ingredients:[{ code:'C100015', name:'아미오다론염산염' }] },
  { itemSeq:'200000016', drugName:'클래리스로마이신정500밀리그람',  company:'애보트',         form:'정제',   ingredients:[{ code:'C100016', name:'클래리스로마이신' }] },
  { itemSeq:'200000017', drugName:'리바록사반정10밀리그람',         company:'바이엘',         form:'정제',   ingredients:[{ code:'C100017', name:'리바록사반' }] },
  { itemSeq:'200000018', drugName:'디아제팜정5밀리그람',            company:'한국로슈',       form:'정제',   ingredients:[{ code:'C100018', name:'디아제팜' }] },
  { itemSeq:'200000019', drugName:'테오필린서방정200밀리그람',      company:'동아제약',       form:'서방정', ingredients:[{ code:'C100019', name:'테오필린' }] },
  { itemSeq:'200000020', drugName:'시프로플록사신정500밀리그람',    company:'바이엘',         form:'정제',   ingredients:[{ code:'C100020', name:'시프로플록사신염산염일수화물' }] },
];

/**
 * Demo DUR 룰 — 성분코드 기반, 식약처 DUR 대표 사례
 * durTypeCd: 1=병용금기 2=용량주의 3=임부금기 4=노인주의 5=연령금기
 */
const DEMO_DUR_RULES = [
  // 병용금기 (type=1 → level=forbidden)
  { ingdCode:'C100002', ingdKorName:'아스피린(아세틸살리실산)',      mixIngdCode:'C100006', mixIngdKorName:'와파린나트륨',           durTypeCd:'1', severityCd:'1', prohibitContent:'아스피린과 와파린 병용 시 항응고 효과가 현저히 증가하여 심각한 출혈 위험이 있습니다.' },
  { ingdCode:'C100004', ingdKorName:'이부프로펜',                   mixIngdCode:'C100006', mixIngdKorName:'와파린나트륨',           durTypeCd:'1', severityCd:'1', prohibitContent:'이부프로펜과 와파린 병용 시 출혈 위험 증가 및 와파린 효과 증대로 병용 금기입니다.' },
  { ingdCode:'C100009', ingdKorName:'클로피도그렐황산염',            mixIngdCode:'C100003', mixIngdKorName:'오메프라졸',            durTypeCd:'1', severityCd:'1', prohibitContent:'오메프라졸이 클로피도그렐 활성화(CYP2C19)를 억제하여 항혈소판 효과가 감소합니다.' },
  { ingdCode:'C100014', ingdKorName:'심바스타틴',                   mixIngdCode:'C100015', mixIngdKorName:'아미오다론염산염',       durTypeCd:'1', severityCd:'1', prohibitContent:'아미오다론이 심바스타틴 대사를 억제하여 근육병증(횡문근융해증) 위험이 있습니다.' },
  { ingdCode:'C100013', ingdKorName:'아토르바스타틴칼슘삼수화물',   mixIngdCode:'C100016', mixIngdKorName:'클래리스로마이신',       durTypeCd:'1', severityCd:'1', prohibitContent:'클래리스로마이신이 아토르바스타틴 혈중 농도를 증가시켜 횡문근융해증 위험이 있습니다.' },
  { ingdCode:'C100006', ingdKorName:'와파린나트륨',                  mixIngdCode:'C100017', mixIngdKorName:'리바록사반',            durTypeCd:'1', severityCd:'1', prohibitContent:'와파린과 리바록사반 병용은 과도한 항응고 작용으로 심각한 출혈 위험이 있어 금기입니다.' },

  // 용량주의 (type=2 → level=danger)
  { ingdCode:'C100001', ingdKorName:'아세트아미노펜',               mixIngdCode:'C100004', mixIngdKorName:'이부프로펜',            durTypeCd:'2', severityCd:'2', prohibitContent:'장기 병용 시 신독성 위험이 증가합니다. 용량 및 기간 조절 필요.' },
  { ingdCode:'C100007', ingdKorName:'디곡신',                       mixIngdCode:'C100015', mixIngdKorName:'아미오다론염산염',       durTypeCd:'2', severityCd:'2', prohibitContent:'아미오다론이 디곡신 혈중 농도를 높여 서맥·부정맥 등 디곡신 독성 위험이 증가합니다.' },
  { ingdCode:'C100002', ingdKorName:'아스피린(아세틸살리실산)',      mixIngdCode:'C100004', mixIngdKorName:'이부프로펜',            durTypeCd:'2', severityCd:'2', prohibitContent:'두 NSAIDs 병용 시 위장관 출혈 및 신독성 위험이 증가합니다.' },
  { ingdCode:'C100019', ingdKorName:'테오필린',                     mixIngdCode:'C100020', mixIngdKorName:'시프로플록사신염산염일수화물', durTypeCd:'2', severityCd:'2', prohibitContent:'시프로플록사신이 테오필린 대사를 억제하여 테오필린 독성(구역·경련) 위험이 증가합니다.' },
  { ingdCode:'C100008', ingdKorName:'탄산리튬',                     mixIngdCode:'C100004', mixIngdKorName:'이부프로펜',            durTypeCd:'2', severityCd:'2', prohibitContent:'이부프로펜이 리튬 신장 배설을 억제하여 리튬 독성(진전·혼돈) 위험이 증가합니다.' },

  // 임부금기 (type=3 → level=danger)
  { ingdCode:'C100018', ingdKorName:'디아제팜',                     mixIngdCode:'C100004', mixIngdKorName:'이부프로펜',            durTypeCd:'3', severityCd:'2', prohibitContent:'임신 중 디아제팜과 이부프로펜 병용은 태아에 영향을 줄 수 있습니다.' },

  // 노인주의 (type=4 → level=caution)
  { ingdCode:'C100018', ingdKorName:'디아제팜',                     mixIngdCode:'C100011', mixIngdKorName:'세티리진염산염',        durTypeCd:'4', severityCd:'2', prohibitContent:'노인에서 디아제팜과 세티리진 병용 시 중추신경 억제 및 낙상 위험이 증가합니다.' },

  // 주의 (type=2, severity 낮음)
  { ingdCode:'C100001', ingdKorName:'아세트아미노펜',               mixIngdCode:'C100002', mixIngdKorName:'아스피린(아세틸살리실산)', durTypeCd:'2', severityCd:'3', prohibitContent:'단기 병용은 가능하나 장기 병용 시 신독성 주의. 권장 용법·용량을 지키세요.' },
  { ingdCode:'C100001', ingdKorName:'아세트아미노펜',               mixIngdCode:'C100006', mixIngdKorName:'와파린나트륨',           durTypeCd:'2', severityCd:'3', prohibitContent:'장기 복용 시 와파린 효과가 증가할 수 있습니다. INR 정기 모니터링을 권장합니다.' },
];


// ─────────────────────────────────────────────────────────────────────────────
// §4. DUR 인덱스 — 성분코드 페어 기반 O(1) 조회
// ─────────────────────────────────────────────────────────────────────────────
// 'ingdCode|mixIngdCode' (알파벳 정렬 — 방향 무관)
function durKey(a, b) { return a < b ? `${a}|${b}` : `${b}|${a}`; }

const durIndex = new Map(); // durKey → DurRule[]
let durLoaded  = false;
let durTotal   = 0;

function indexDurRule(rule) {
  if (!rule.ingdCode || !rule.mixIngdCode) return;
  const key = durKey(rule.ingdCode, rule.mixIngdCode);
  if (!durIndex.has(key)) durIndex.set(key, []);
  durIndex.get(key).push(rule);
}

function loadDurFromArray(rules) {
  durIndex.clear();
  for (const r of rules) indexDurRule(r);
  durTotal  = rules.length;
  durLoaded = true;
}


// ─────────────────────────────────────────────────────────────────────────────
// §5. 식약처 API 클라이언트
// ─────────────────────────────────────────────────────────────────────────────

// API 응답 items.item 정규화 (단건 시 객체 반환 방어)
function normalizeItems(body) {
  const item = body?.items?.item;
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

// 약 이름으로 식약처 DUR 목록 검색 → Drug[]
async function searchDrugsFromMFDS(query) {
  const resp = await axios.get(MFDS_DUR_SEARCH, {
    timeout: SEARCH_TIMEOUT_MS,
    params: { ServiceKey: DRUG_API_KEY, item_name: query, numOfRows: String(SEARCH_LIMIT * 5), pageNo: '1', _type: 'json' },
  });
  const items = normalizeItems(resp.data?.response?.body);
  const bySeq = new Map();
  for (const it of items) {
    const seq = String(it.ITEM_SEQ ?? '').trim();
    const name = String(it.ITEM_NAME ?? '').trim();
    const ic  = String(it.INGD_CODE ?? '').trim();
    const in_ = String(it.INGD_NAME ?? '').trim();
    if (!seq || !name) continue;
    if (!bySeq.has(seq)) bySeq.set(seq, { itemSeq: seq, drugName: name, company: '', form: '', ingredients: [] });
    const d = bySeq.get(seq);
    if (ic && !d.ingredients.some(i => i.code === ic)) d.ingredients.push({ code: ic, name: in_ });
  }
  return [...bySeq.values()].slice(0, SEARCH_LIMIT);
}

// 식약처 DUR 병용금기 룰 전체 로드 (startup 1회)
async function loadDurRulesFromMFDS() {
  console.log('[DUR] 식약처 병용금기 룰 로딩...');
  durIndex.clear();
  let loaded = 0;
  let pageNo = 1;
  while (true) {
    let body;
    try {
      const resp = await axios.get(MFDS_DUR_COMBO, {
        timeout: 15_000,
        params: { ServiceKey: DRUG_API_KEY, pageNo: String(pageNo), numOfRows: String(DUR_PAGE_SIZE), _type: 'json' },
      });
      body = resp.data?.response?.body;
    } catch (err) { console.error(`[DUR] p.${pageNo} 실패: ${err.message}`); break; }

    const total = parseInt(body?.totalCount ?? '0', 10) || 0;
    const items = normalizeItems(body);
    if (items.length === 0) break;

    for (const it of items) {
      indexDurRule({
        ingdCode:        String(it.INGD_CODE         ?? '').trim(),
        ingdKorName:     String(it.INGD_KOR_NAME     ?? '').trim(),
        mixIngdCode:     String(it.MIX_INGD_CODE     ?? '').trim(),
        mixIngdKorName:  String(it.MIX_INGD_KOR_NAME ?? '').trim(),
        durTypeCd:       '1', // getUsjntTabooInfoList3 는 병용금기(type=1) 전용
        severityCd:      String(it.SEVERITY_CD       ?? '1').trim(),
        prohibitContent: String(it.PROHIBIT_CONTENT  ?? '').trim(),
      });
      loaded++;
    }
    console.log(`[DUR] ${loaded}/${total} (p.${pageNo})`);
    if (loaded >= total || items.length < DUR_PAGE_SIZE) break;
    pageNo++;
  }
  if (loaded > 0) {
    durTotal = loaded; durLoaded = true;
    console.log(`[DUR] 완료 — ${durTotal}개 병용금기 룰`);
  } else {
    console.warn('[DUR] API 로드 실패 — DEMO 룰 사용');
    loadDurFromArray(DEMO_DUR_RULES);
  }
}

async function initDurRules() {
  if (DEMO_MODE) {
    loadDurFromArray(DEMO_DUR_RULES);
    console.log(`[DUR] DEMO 모드 — ${durTotal}개 룰 로드`);
  } else {
    await loadDurRulesFromMFDS();
  }
}


// ─────────────────────────────────────────────────────────────────────────────
// §6. DUR 조회 로직
// ─────────────────────────────────────────────────────────────────────────────

// 두 약 성분 목록 크로스 페어 → 가장 심각한 DUR 룰 (없으면 null)
function lookupDur(ingA, ingB) {
  let worstRule = null;
  let worstPrio = -1;
  for (const a of (ingA ?? [])) {
    for (const b of (ingB ?? [])) {
      if (!a.code || !b.code) continue;
      const rules = durIndex.get(durKey(a.code, b.code));
      if (!rules) continue;
      for (const rule of rules) {
        const prio = LEVEL_PRIORITY[DUR_TYPE_TO_LEVEL[rule.durTypeCd] ?? 'safe'] ?? 0;
        if (prio > worstPrio) { worstPrio = prio; worstRule = rule; }
      }
    }
  }
  return worstRule;
}

// 한국어 조사 선택 (과/와)
function koParticle(word, withJongseong, withoutJongseong) {
  const code = (word?.slice(-1) ?? '').charCodeAt(0);
  if (code >= 0xAC00 && code <= 0xD7A3) return (code - 0xAC00) % 28 > 0 ? withJongseong : withoutJongseong;
  return withJongseong;
}

// DurRule + 두 Drug → PairResult (sourceType=rule)
function buildRulePairResult(drugA, drugB, rule) {
  const level    = DUR_TYPE_TO_LEVEL[rule.durTypeCd] ?? 'caution';
  const durBasis = DUR_TYPE_TO_BASIS[rule.durTypeCd] ?? 'UNKNOWN';
  const typeLabel= LEVEL_LABEL[level] ?? '주의';

  const nameFor = (code) => {
    if (rule.ingdCode    === code && rule.ingdKorName)    return rule.ingdKorName;
    if (rule.mixIngdCode === code && rule.mixIngdKorName) return rule.mixIngdKorName;
    for (const d of [drugA, drugB]) {
      const f = (d.ingredients ?? []).find(i => i.code === code);
      if (f?.name) return f.name;
    }
    return code;
  };
  const nameA = nameFor(rule.ingdCode);
  const nameB = nameFor(rule.mixIngdCode);
  const explanation = `${nameA}${koParticle(nameA, '과', '와')} ${nameB} 병용은 식약처 DUR ${typeLabel} 성분으로 등록되어 있습니다. ${rule.prohibitContent}`;

  return {
    drugASeq: drugA.itemSeq, drugAName: drugA.drugName,
    drugBSeq: drugB.itemSeq, drugBName: drugB.drugName,
    level, confidence: 1.0, explanation, sourceType: 'rule', durBasis,
  };
}


// ─────────────────────────────────────────────────────────────────────────────
// §7. ML 마이크로서비스 클라이언트
//     합의 스펙: POST http://localhost:8001/predict
//     입력: { pairs: [{ drugASeq, drugAIngredients, drugBSeq, drugBIngredients, durRules }] }
//     출력: { pairs: [{ drugASeq, drugBSeq, level, confidence, explanation, sourceType, durBasis }] }
// ─────────────────────────────────────────────────────────────────────────────
async function callMlService(pairs) {
  if (pairs.length === 0) return { pairs: [] };
  const resp = await axios.post(ML_URL, { pairs }, { timeout: ML_TIMEOUT_MS });
  if (!resp.data?.pairs) throw new Error('ML 응답에 pairs 필드 없음');
  return resp.data;
}


// ─────────────────────────────────────────────────────────────────────────────
// §8. 핵심 상호작용 분석 로직
// ─────────────────────────────────────────────────────────────────────────────
/**
 * 흐름:
 *   C(n,2) 쌍 생성
 *   → DUR 매칭 쌍: 룰 결과 즉시 확정 (ML 호출 없음 — 부하 절감 + confidence=1.0)
 *   → DUR 미매칭 쌍: ML 배치 추론
 *   → ML 불응: safe 폴백 (confidence=0.0)
 *   → 원래 순서 복원 + 종합 판정 (최고 위험 원칙)
 */
async function analyzeInteractions(drugs) {
  const ruleResults = [];
  const mlQueue     = []; // { pairIdx, drugA, drugB, mlPair }
  let   pairIdx     = 0;

  for (let i = 0; i < drugs.length; i++) {
    for (let j = i + 1; j < drugs.length; j++) {
      const dA = drugs[i], dB = drugs[j];
      const rule = lookupDur(dA.ingredients, dB.ingredients);

      if (rule) {
        ruleResults.push({ pairIdx, result: buildRulePairResult(dA, dB, rule) });
      } else {
        mlQueue.push({
          pairIdx, drugA: dA, drugB: dB,
          mlPair: {
            drugASeq:         dA.itemSeq,
            drugAIngredients: (dA.ingredients ?? []).map(i => ({ ingredientCode: i.code, ingredientName: i.name })),
            drugBSeq:         dB.itemSeq,
            drugBIngredients: (dB.ingredients ?? []).map(i => ({ ingredientCode: i.code, ingredientName: i.name })),
            durRules:         [], // DUR 인덱스에 없는 조합만 ML에 전송
          },
        });
      }
      pairIdx++;
    }
  }

  // ML 일괄 호출 (실패 시 safe 폴백 — 서비스 무중단)
  let mlResponses = null;
  if (mlQueue.length > 0) {
    try {
      const mlResult = await callMlService(mlQueue.map(q => q.mlPair));
      mlResponses = mlResult.pairs;
    } catch (err) {
      console.warn(`[ANALYZE] ML 불응 (폴백): ${err.message}`);
    }
  }

  const mlResults = mlQueue.map((q, k) => {
    const mlr = mlResponses?.[k];
    if (mlr?.level) {
      return {
        pairIdx: q.pairIdx,
        result: {
          drugASeq: q.drugA.itemSeq, drugAName: q.drugA.drugName,
          drugBSeq: q.drugB.itemSeq, drugBName: q.drugB.drugName,
          level:      mlr.level,
          confidence: mlr.confidence ?? NaN, // ?? NaN: null → NaN (null=0 오판정 방어)
          explanation:mlr.explanation ?? '상호작용 분석 결과입니다.',
          sourceType: 'ml',
          durBasis:   null,
        },
      };
    }
    // ML 폴백 → safe, confidence=0.0 (AI 엔지니어 합의)
    return {
      pairIdx: q.pairIdx,
      result: {
        drugASeq: q.drugA.itemSeq, drugAName: q.drugA.drugName,
        drugBSeq: q.drugB.itemSeq, drugBName: q.drugB.drugName,
        level:      'safe',
        confidence: ML_CONFIDENCE_FALLBACK,
        explanation:'해당 조합의 상호작용 데이터가 없습니다. 의사·약사와 상담하세요.',
        sourceType: 'rule',
        durBasis:   null,
      },
    };
  });

  // 원래 순서 복원
  const allPairs = [...ruleResults, ...mlResults]
    .sort((a, b) => a.pairIdx - b.pairIdx)
    .map(x => x.result);

  // 종합 판정 — 최고 위험 원칙 (design-spec §4 Screen4)
  const overallLevel = allPairs.reduce((max, p) => {
    return (LEVEL_PRIORITY[p.level] ?? 0) > (LEVEL_PRIORITY[max] ?? 0) ? p.level : max;
  }, 'safe');

  return { overallLevel, pairs: allPairs };
}


// ─────────────────────────────────────────────────────────────────────────────
// §9. Express 앱 + 미들웨어
// ─────────────────────────────────────────────────────────────────────────────
const app = express();
app.use(cors());
app.use(express.json({ limit: '512kb' }));
app.use(express.static(path.join(__dirname, 'public'), { index: false }));

// 요청 로그
app.use((req, _res, next) => { req._t = Date.now(); next(); });
app.use((req, res, next) => {
  const orig = res.end.bind(res);
  res.end = (...a) => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - (req._t ?? 0)}ms`);
    return orig(...a);
  };
  next();
});


// ─────────────────────────────────────────────────────────────────────────────
// §10. API 라우트
// ─────────────────────────────────────────────────────────────────────────────

// ── GET /health ───────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    status   : 'ok',
    service  : 'YakCheck API',
    version  : '2.0.0',
    demo     : DEMO_MODE,
    timestamp: new Date().toISOString(),
    ml       : { url: ML_URL, timeoutMs: ML_TIMEOUT_MS },
    dur      : { loaded: durLoaded, total: durTotal },
    uptime   : Math.floor(process.uptime()),
    node     : process.version,
  });
});

// ── GET /api/drugs/search?q=약이름[&limit=7] ─────────────────────────────────
app.get('/api/drugs/search', async (req, res) => {
  const q     = String(req.query.q ?? '').trim();
  const limit = Math.min(Math.max(parseInt(String(req.query.limit ?? ''), 10) || SEARCH_LIMIT, 1), 20);

  if (q.length < 1) {
    return res.status(400).json({ error: 'user_error', message: '검색어를 1자 이상 입력하세요.', userFacing: true });
  }

  const cacheKey = `s:${q}:${limit}`;
  const cached   = searchCache.get(cacheKey);
  if (cached) return res.json(cached);

  try {
    let results;
    if (DEMO_MODE) {
      const lq = q.toLowerCase();
      results = DEMO_DRUGS.filter(d =>
        d.drugName.includes(q) ||
        d.ingredients.some(i => i.name.includes(q) || i.name.toLowerCase().includes(lq)) ||
        d.drugName.toLowerCase().includes(lq),
      ).slice(0, limit);
    } else {
      results = await searchDrugsFromMFDS(q);
    }
    const payload = { results, total: results.length, query: q, source: DEMO_MODE ? 'demo' : 'mfds' };
    searchCache.set(cacheKey, payload);
    return res.json(payload);

  } catch (err) {
    console.error('[SEARCH]', err.message);
    // 식약처 API 오류 → Demo 폴백
    if (!DEMO_MODE) {
      const lq = q.toLowerCase();
      const fallback = DEMO_DRUGS.filter(d =>
        d.drugName.toLowerCase().includes(lq) || d.ingredients.some(i => i.name.toLowerCase().includes(lq))
      ).slice(0, limit);
      return res.json({ results: fallback, total: fallback.length, query: q, source: 'demo_fallback', apiError: true });
    }
    return res.status(503).json({ error: 'system_error', message: '검색 서비스에 일시적 오류가 발생했습니다.', userFacing: false });
  }
});

// ── POST /api/interactions/analyze ───────────────────────────────────────────
app.post('/api/interactions/analyze', async (req, res) => {
  const { drugs } = req.body ?? {};

  if (!Array.isArray(drugs)) {
    return res.status(400).json({ error: 'user_error', message: '요청 본문에 drugs 배열이 필요합니다.', userFacing: true });
  }
  if (drugs.length < 2) {
    return res.status(400).json({ error: 'user_error', message: '2개 이상의 약물을 입력하세요.', userFacing: true });
  }
  if (drugs.length > MAX_DRUGS) {
    return res.status(400).json({ error: 'user_error', message: `최대 ${MAX_DRUGS}개까지 분석 가능합니다.`, userFacing: true });
  }
  for (let i = 0; i < drugs.length; i++) {
    const d = drugs[i];
    if (!d?.itemSeq  || typeof d.itemSeq  !== 'string') return res.status(400).json({ error: 'user_error', message: `drugs[${i}].itemSeq(string) 필수`, userFacing: true });
    if (!d?.drugName || typeof d.drugName !== 'string') return res.status(400).json({ error: 'user_error', message: `drugs[${i}].drugName(string) 필수`, userFacing: true });
    if (!Array.isArray(d?.ingredients))                 return res.status(400).json({ error: 'user_error', message: `drugs[${i}].ingredients(array) 필수`, userFacing: true });
    for (let k = 0; k < d.ingredients.length; k++) {
      if (typeof d.ingredients[k]?.code !== 'string')  return res.status(400).json({ error: 'user_error', message: `drugs[${i}].ingredients[${k}].code(string) 필수`, userFacing: true });
    }
  }
  // 중복 itemSeq 방어
  const seqs = drugs.map(d => d.itemSeq);
  if (new Set(seqs).size !== seqs.length) {
    return res.status(400).json({ error: 'user_error', message: '중복된 약(itemSeq)이 포함되어 있습니다.', userFacing: true });
  }

  try {
    const result = await analyzeInteractions(drugs);
    return res.json({ ...result, analyzedAt: new Date().toISOString(), drugCount: drugs.length, pairCount: result.pairs.length });
  } catch (err) {
    console.error('[ANALYZE]', err.message, err.stack);
    return res.status(500).json({ error: 'system_error', message: '분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.', userFacing: false });
  }
});

// ── 404 (API 경로에만) ────────────────────────────────────────────────────────
app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'not_found', message: '요청한 API 경로가 없습니다.' });
});

// SPA 폴백 — public/index.html
const INDEX_PATH = path.join(__dirname, 'public', 'index.html');
app.get('/{*splat}', (_req, res) => {
  if (fs.existsSync(INDEX_PATH)) res.sendFile(INDEX_PATH);
  else res.status(404).json({ error: 'not_found', message: 'index.html 없음' });
});

// 전역 오류 핸들러
app.use((err, _req, res, _next) => {
  console.error('[SERVER] 처리되지 않은 오류:', err.stack);
  res.status(500).json({ error: 'system_error', message: '서버 내부 오류가 발생했습니다.', userFacing: false });
});


// ─────────────────────────────────────────────────────────────────────────────
// §11. 서버 시작
// ─────────────────────────────────────────────────────────────────────────────
async function start() {
  console.log('═══════════════════════════════════════');
  console.log('  약체크 YakCheck 백엔드 서버 v2.0');
  console.log('═══════════════════════════════════════');
  console.log(`  모드   : ${DEMO_MODE ? 'DEMO (식약처 API 키 없음)' : '공공데이터 API'}`);
  console.log(`  포트   : ${PORT}`);
  console.log(`  ML URL : ${ML_URL} (타임아웃 ${ML_TIMEOUT_MS}ms)`);

  // DUR 룰 선로드 — 서버 응답 전 완료 보장
  await initDurRules();

  const server = app.listen(PORT, () => {
    console.log(`\n✓ 서버 시작: http://localhost:${PORT}`);
    console.log(`✓ DUR 룰  : ${durTotal}개 로드됨`);
  });

  // 우아한 종료 (SIGTERM: Docker/K8s, SIGINT: Ctrl+C)
  const shutdown = (sig) => {
    console.log(`\n[shutdown] ${sig} 수신`);
    server.close(() => { console.log('[shutdown] 완료'); process.exit(0); });
    setTimeout(() => process.exit(1), 10_000);
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));
}

start().catch(err => { console.error('[fatal]', err); process.exit(1); });

module.exports = app; // 테스트 가능하도록 export
