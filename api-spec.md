# API Spec — 약체크 YakCheck
> **대상**: 프론트엔드 구현팀  
> **기준일**: 2026-06-13  
> **서버**: `http://localhost:3000` (개발) / 배포 주소 별도 공지  
> **인코딩**: UTF-8 / Content-Type: `application/json`

---

## 개요

| 엔드포인트 | 메서드 | 역할 |
|-----------|--------|------|
| `/health` | GET | 서버 상태 확인 |
| `/api/drugs/search` | GET | 약 이름 검색 (성분코드 포함) |
| `/api/interactions/analyze` | POST | 약물 상호작용 분석 |

---

## 공통 규약

### 오류 응답 (모든 엔드포인트 공통)

```json
{
  "error": "error_code",
  "message": "한국어 사용자 안내 메시지",
  "userFacing": true
}
```

| `error` 코드 | HTTP | 원인 | 표시 방법 |
|-------------|------|------|----------|
| `user_error` | 400 | 입력 오류 (약 개수·형식 등) | 오렌지 `TriangleAlert` — design-spec §5-A |
| `not_found` | 404 | 없는 API 경로 | — |
| `system_error` | 500 | 서버 내부 오류 | 레드 `ServerCrash` — design-spec §5-B |
| `service_error` | 503 | 외부 API 타임아웃 | 레드 `ServerCrash` — design-spec §5-B |

> `userFacing: false`인 오류는 서버/시스템 원인 → design-spec §5-B 화면 표시  
> `userFacing: true`인 오류는 사용자 입력 원인 → design-spec §5-A 화면 표시

---

## 1. GET /health

서버 구동 여부 및 DUR 룰 로드 상태를 확인합니다.

### 응답 200

```json
{
  "status": "ok",
  "service": "YakCheck API",
  "version": "2.0.0",
  "demo": true,
  "timestamp": "2026-06-13T16:00:00.000Z",
  "ml": {
    "url": "http://localhost:8001/predict",
    "timeoutMs": 5000
  },
  "dur": {
    "loaded": true,
    "total": 15
  },
  "uptime": 42,
  "node": "v22.22.2"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `demo` | boolean | `true` = 식약처 API 키 없음, Demo 데이터 사용 |
| `dur.loaded` | boolean | DUR 룰 로드 완료 여부 |
| `dur.total` | number | 로드된 DUR 룰 건수 |

---

## 2. GET /api/drugs/search

약 이름(한글/영문)이나 성분명으로 검색합니다.  
검색 결과에 **성분코드**가 포함되어야 `/api/interactions/analyze` 호출이 정상 작동합니다.

### 요청

```
GET /api/drugs/search?q=타이레놀&limit=7
```

| 파라미터 | 필수 | 타입 | 설명 | 기본값 |
|---------|------|------|------|-------|
| `q` | ✅ | string | 검색어 (1자 이상) | — |
| `limit` | ❌ | number | 최대 결과 수 (1~20) | 7 |

### 응답 200

```json
{
  "results": [
    {
      "itemSeq": "200000001",
      "drugName": "타이레놀정500밀리그람",
      "company": "한국얀센",
      "form": "정제",
      "ingredients": [
        { "code": "C100001", "name": "아세트아미노펜" }
      ]
    }
  ],
  "total": 1,
  "query": "타이레놀",
  "source": "demo"
}
```

| 필드 | 타입 | 설명 |
|------|------|------|
| `results[].itemSeq` | string | 식약처 품목 일련번호 — `/analyze` 요청 시 `itemSeq`로 전달 |
| `results[].drugName` | string | 약품명 (한글) |
| `results[].company` | string | 제조사 |
| `results[].form` | string | 제형 (정제/캡슐/시럽 등) |
| `results[].ingredients` | array | 주성분 목록 — `code`+`name` 쌍 |
| `results[].ingredients[].code` | string | 성분코드 — DUR 조회 키 |
| `results[].ingredients[].name` | string | 성분 한국어명 |
| `source` | string | `"demo"` / `"mfds"` / `"demo_fallback"` |
| `apiError` | boolean? | `true` = 식약처 API 오류로 Demo 폴백 사용됨 |

### 오류

| 상황 | HTTP | error |
|------|------|-------|
| `q` 1자 미만 | 400 | `user_error` |
| 식약처 API 오류 (키 있는 경우) | — | Demo 폴백 자동 적용, `apiError: true` |

> **구현 가이드**: 드롭다운은 `results`를 그대로 표시합니다. 약을 선택하면 `{ itemSeq, drugName, ingredients }` 전체를 칩 상태에 보관했다가 `/analyze` 요청에 포함하세요.

---

## 3. POST /api/interactions/analyze

선택된 약 목록(2~10개)의 모든 쌍 상호작용을 분석합니다.

### 요청 Body

```json
{
  "drugs": [
    {
      "itemSeq": "200000001",
      "drugName": "타이레놀정500밀리그람",
      "ingredients": [
        { "code": "C100001", "name": "아세트아미노펜" }
      ]
    },
    {
      "itemSeq": "200000002",
      "drugName": "아스피린프로텍트정100밀리그람",
      "ingredients": [
        { "code": "C100002", "name": "아스피린(아세틸살리실산)" }
      ]
    }
  ]
}
```

| 필드 | 필수 | 타입 | 제약 |
|------|------|------|------|
| `drugs` | ✅ | array | 2~10개 |
| `drugs[].itemSeq` | ✅ | string | 검색 결과의 `itemSeq` 그대로 사용 |
| `drugs[].drugName` | ✅ | string | 화면 표시용 약품명 |
| `drugs[].ingredients` | ✅ | array | 빈 배열 허용 (DUR 조회 불가, ML 추론 시도) |
| `drugs[].ingredients[].code` | ✅ | string | 성분코드 |
| `drugs[].ingredients[].name` | ❌ | string | 성분명 (explanation에 사용) |

### 응답 200

```json
{
  "overallLevel": "forbidden",
  "pairs": [
    {
      "drugASeq": "200000001",
      "drugAName": "타이레놀정500밀리그람",
      "drugBSeq": "200000002",
      "drugBName": "아스피린프로텍트정100밀리그람",
      "level": "danger",
      "confidence": 1.0,
      "explanation": "아세트아미노펜과 아스피린(아세틸살리실산) 병용은 식약처 DUR 위험 성분으로 등록되어 있습니다. 장기 병용 시 신독성 주의.",
      "sourceType": "rule",
      "durBasis": "DOSE_CAUTION"
    },
    {
      "drugASeq": "200000001",
      "drugAName": "타이레놀정500밀리그람",
      "drugBSeq": "200000006",
      "drugBName": "와파린나트륨정5밀리그람",
      "level": "forbidden",
      "confidence": 1.0,
      "explanation": "아스피린(아세틸살리실산)과 와파린나트륨 병용은 식약처 DUR 병용금기 성분으로 등록되어 있습니다. ...",
      "sourceType": "rule",
      "durBasis": "COMBO_TABOO"
    }
  ],
  "analyzedAt": "2026-06-13T16:00:00.000Z",
  "drugCount": 3,
  "pairCount": 2
}
```

### 응답 필드 명세

#### 최상위

| 필드 | 타입 | 설명 |
|------|------|------|
| `overallLevel` | Level | 전체 쌍 중 **가장 심각한** 위험도 — 종합 판정 배지에 표시 |
| `pairs` | array | 모든 C(n,2) 쌍 결과 (정렬: 입력 순서) |
| `analyzedAt` | string | ISO 8601 분석 시각 |
| `drugCount` | number | 분석한 약 수 |
| `pairCount` | number | 분석한 쌍 수 = C(n,2) |

#### pairs[]

| 필드 | 타입 | 설명 |
|------|------|------|
| `drugASeq` | string | 약 A 품목 일련번호 |
| `drugAName` | string | 약 A 이름 |
| `drugBSeq` | string | 약 B 품목 일련번호 |
| `drugBName` | string | 약 B 이름 |
| `level` | Level | 이 쌍의 위험도 |
| `confidence` | number | 신뢰도 0.0~1.0 (`rule` 기반은 항상 1.0) |
| `explanation` | string | **한국어** 상세 설명 — 카드에 그대로 표시 |
| `sourceType` | `"rule"` \| `"ml"` | 결과 출처 |
| `durBasis` | string \| null | `sourceType=rule`일 때 DUR 유형 코드, `ml`일 때 `null` |

### Level 타입 (4단계)

| 값 | 위험도 | design-spec 색상 토큰 | 아이콘 | 종합 판정 메시지 |
|----|--------|----------------------|--------|----------------|
| `"safe"` | 안전 | `--risk-safe-*` | `CheckCircle2` | 안전 — 주요 상호작용 없음 |
| `"caution"` | 주의 | `--risk-caution-*` | `AlertTriangle` | 주의 — 복용 전 약사 확인 권장 |
| `"danger"` | 위험 | `--risk-danger-*` | `OctagonAlert` | 위험 — 의사 처방 필요 |
| `"forbidden"` | 금기 | `--risk-forbidden-*` | `Ban` | 금기 — 병용 금지 |

### durBasis 코드

| 코드 | DUR 유형 | level |
|------|----------|-------|
| `COMBO_TABOO` | 병용금기 | `forbidden` |
| `DOSE_CAUTION` | 용량주의 | `danger` |
| `PREG_TABOO` | 임부금기 | `danger` |
| `ELDERLY_CAUTION` | 노인주의 | `caution` |
| `AGE_TABOO` | 연령금기 | `caution` |

### sourceType 표시 규칙

| `sourceType` | `confidence` | UI 처리 |
|-------------|-------------|---------|
| `"rule"` | 1.0 | 정상 결과 카드 표시 |
| `"ml"` | 0.0~1.0 (모델 출력) | 정상 결과 + 하단 `[규칙 기반 결과]` 배지 **없음** |
| `"rule"` + `confidence=0.0` | 0.0 | ML 폴백 → 하단 `[i] 규칙 기반 결과` 배지 표시 |

> **폴백 감지**: `sourceType === "rule" && confidence === 0.0` → design-spec §3-2 `ANALYSIS_FALLBACK` 상태

### 오류

| 상황 | HTTP | error |
|------|------|-------|
| `drugs` 없거나 배열 아님 | 400 | `user_error` |
| 약 1개 이하 | 400 | `user_error` |
| 약 11개 이상 | 400 | `user_error` |
| `itemSeq` 없음 | 400 | `user_error` |
| `ingredients` 없음 | 400 | `user_error` |
| 중복 `itemSeq` | 400 | `user_error` |
| 분석 중 서버 내부 오류 | 500 | `system_error` |

---

## 4. 프론트엔드 구현 플로우

```
[1] 사용자 검색 입력
      GET /api/drugs/search?q=타이레놀
      ↓ results[] → 드롭다운 표시

[2] 사용자 약 선택
      { itemSeq, drugName, ingredients } → 칩으로 보관

[3] 2개 이상 선택 후 분석 버튼
      POST /api/interactions/analyze
      body: { drugs: [ ...선택된칩들 ] }

[4] 응답 처리
      overallLevel  → 종합 판정 배지 (Screen 4 [2])
      pairs[]       → 개별 카드 (Screen 4 [3])
      L3/L4 존재 시 → medical-warning 배너 삽입

[5] 오류 처리
      userFacing=true  → design-spec §5-A (오렌지 TriangleAlert)
      userFacing=false → design-spec §5-B (레드 ServerCrash)
```

---

## 5. Demo 모드 약물 목록 (DRUG_API_KEY 없을 때)

| `itemSeq` | `drugName` | 성분코드 | 성분명 |
|-----------|-----------|---------|-------|
| 200000001 | 타이레놀정500밀리그람 | C100001 | 아세트아미노펜 |
| 200000002 | 아스피린프로텍트정100밀리그람 | C100002 | 아스피린(아세틸살리실산) |
| 200000003 | 오메프라졸캡슐20밀리그람 | C100003 | 오메프라졸 |
| 200000004 | 이부프로펜정400밀리그람 | C100004 | 이부프로펜 |
| 200000005 | 메트포르민염산염정500밀리그람 | C100005 | 메트포르민염산염 |
| 200000006 | 와파린나트륨정5밀리그람 | C100006 | 와파린나트륨 |
| 200000007 | 디곡신정0.25밀리그람 | C100007 | 디곡신 |
| 200000008 | 탄산리튬정300밀리그람 | C100008 | 탄산리튬 |
| 200000009 | 클로피도그렐정75밀리그람 | C100009 | 클로피도그렐황산염 |
| 200000010 | 암로디핀베실산염정5밀리그람 | C100010 | 암로디핀베실산염 |
| 200000011 | 세티리진염산염정10밀리그람 | C100011 | 세티리진염산염 |
| 200000014 | 심바스타틴정20밀리그람 | C100014 | 심바스타틴 |
| 200000015 | 아미오다론염산염정200밀리그람 | C100015 | 아미오다론염산염 |
| 200000016 | 클래리스로마이신정500밀리그람 | C100016 | 클래리스로마이신 |

### Demo 주요 DUR 규칙 (테스트 참고용)

| 약 A | 약 B | 예상 level | durBasis |
|------|------|-----------|---------|
| 아스피린(C100002) | 와파린(C100006) | `forbidden` | `COMBO_TABOO` |
| 이부프로펜(C100004) | 와파린(C100006) | `forbidden` | `COMBO_TABOO` |
| 클로피도그렐(C100009) | 오메프라졸(C100003) | `forbidden` | `COMBO_TABOO` |
| 심바스타틴(C100014) | 아미오다론(C100015) | `forbidden` | `COMBO_TABOO` |
| 아세트아미노펜(C100001) | 이부프로펜(C100004) | `danger` | `DOSE_CAUTION` |
| 아세트아미노펜(C100001) | 아스피린(C100002) | `danger` | `DOSE_CAUTION` |
| 아세트아미노펜(C100001) | 와파린(C100006) | `danger` | `DOSE_CAUTION` |
| 암로디핀(C100010) + 메트포르민(C100005) | — | `safe` | ML 폴백 |

---

*API Spec v2.0 — 약체크 YakCheck*  
*담당: 백엔드 Organt | 기준일: 2026-06-13*  
*합의 파트너: AI 엔지니어 (ML 인터페이스), 프론트엔드 (화면 연동)*
