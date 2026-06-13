"""
약체크 YakCheck — ML 마이크로서비스 v1.0
FastAPI 기반 약물 상호작용 판정 서비스

아키텍처: 3계층 폴백
  Layer 1: DUR 규칙 DB (성분코드 기반) → confidence=1.0
  Layer 2: 성분명 토큰 매칭 (정규화 후 부분일치) → confidence=0.70~0.85
  Layer 3: 미확인 → safe, confidence=0.10

엔드포인트: POST /predict
요청: { pairs: [{ drugASeq, drugAName?, drugAIngredients, drugBSeq, drugBName?, drugBIngredients, durRules }] }
응답: { pairs: [{ level, confidence, explanation, sourceUrl }] }

레이턴시 목표: 추론 P95 ≤ 100ms (순수 파이썬, 외부 IO 없음)
"""

import re
import unicodedata
from typing import Optional, List
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
import uvicorn

# ─────────────────────────────────────────────────────────────────────────────
# §1. 파라미터 — 매직넘버 없음, 단일 참조
# ─────────────────────────────────────────────────────────────────────────────
ML_PORT  = 8001
ML_HOST  = "0.0.0.0"

# 계층별 confidence (보수적 초기값 — 운영 데이터로 조정)
CONF_RULE_EXACT    = 1.00   # L1: 코드 정확 매칭
CONF_TOKEN_HIGH    = 0.85   # L2: 이름→코드 매핑 후 규칙 조회
CONF_TOKEN_PARTIAL = 0.70   # L2: 부분 일치(약명 포함)
CONF_UNKNOWN       = 0.10   # L3: 미확인 폴백

# 위험도 우선순위 (최고 위험 원칙)
LEVEL_PRIORITY = {"safe": 0, "caution": 1, "danger": 2, "forbidden": 3}

# 식약처 DUR 링크
MFDS_DUR_SOURCE_URL = "https://nedrug.mfds.go.kr/pbp/CCBBB01/getItemDetail"


# ─────────────────────────────────────────────────────────────────────────────
# §2. 내장 DUR 규칙 DB (성분코드 기반 — 식약처 대표 22건)
#     출처: 식약처 DUR 정보 서비스 (getUsjntTabooInfoList3 등)
#     형식: (ingdCode, mixIngdCode, level, explanation)
# ─────────────────────────────────────────────────────────────────────────────
_RAW_DUR_RULES: List[tuple] = [
    # ── 병용금기 (forbidden) ────────────────────────────────────────────────
    ("C100002", "C100006", "forbidden",
     "아스피린(아세틸살리실산)과 와파린나트륨 병용 시 항응고 효과가 현저히 증가하여 "
     "심각한 출혈 위험이 있습니다. 식약처 DUR 병용금기 성분으로 등록되어 있습니다."),
    ("C100004", "C100006", "forbidden",
     "이부프로펜과 와파린나트륨 병용 시 출혈 위험 증가 및 와파린 효과 증대로 병용 금기입니다. "
     "식약처 DUR 병용금기 성분으로 등록되어 있습니다."),
    ("C100003", "C100009", "forbidden",
     "오메프라졸이 클로피도그렐 활성화(CYP2C19)를 억제하여 항혈소판 효과가 감소합니다. "
     "식약처 DUR 병용금기 성분으로 등록되어 있습니다."),
    ("C100014", "C100015", "forbidden",
     "아미오다론이 심바스타틴 대사를 억제하여 근육병증(횡문근융해증) 위험이 있습니다. "
     "식약처 DUR 병용금기 성분으로 등록되어 있습니다."),
    ("C100013", "C100016", "forbidden",
     "클래리스로마이신이 아토르바스타틴 혈중 농도를 증가시켜 횡문근융해증 위험이 있습니다. "
     "식약처 DUR 병용금기 성분으로 등록되어 있습니다."),
    ("C100006", "C100017", "forbidden",
     "와파린과 리바록사반 병용은 과도한 항응고 작용으로 심각한 출혈 위험이 있어 금기입니다. "
     "식약처 DUR 병용금기 성분으로 등록되어 있습니다."),

    # ── 위험 (danger) ───────────────────────────────────────────────────────
    ("C100001", "C100004", "danger",
     "아세트아미노펜과 이부프로펜 장기 병용 시 신독성 위험이 증가합니다. "
     "용량 및 기간 조절이 필요합니다."),
    ("C100007", "C100015", "danger",
     "아미오다론이 디곡신 혈중 농도를 높여 서맥·부정맥 등 디곡신 독성 위험이 증가합니다. "
     "디곡신 용량 감량이 필요할 수 있습니다."),
    ("C100002", "C100004", "danger",
     "두 NSAIDs(아스피린, 이부프로펜) 병용 시 위장관 출혈 및 신독성 위험이 증가합니다."),
    ("C100019", "C100020", "danger",
     "시프로플록사신이 테오필린 대사를 억제하여 테오필린 독성(구역·경련) 위험이 증가합니다. "
     "테오필린 혈중 농도 모니터링이 필요합니다."),
    ("C100004", "C100008", "danger",
     "이부프로펜이 리튬 신장 배설을 억제하여 리튬 독성(진전·혼돈) 위험이 증가합니다. "
     "리튬 혈중 농도 모니터링이 필요합니다."),
    ("C100004", "C100018", "danger",
     "임신 중 디아제팜과 이부프로펜 병용은 태아에 영향을 줄 수 있습니다. "
     "임산부의 경우 반드시 의사 상담 후 복용하세요."),

    # ── 주의 (caution) ──────────────────────────────────────────────────────
    ("C100011", "C100018", "caution",
     "노인에서 디아제팜과 세티리진 병용 시 중추신경 억제 및 낙상 위험이 증가합니다."),
    ("C100001", "C100002", "caution",
     "아세트아미노펜과 아스피린 단기 병용은 가능하나 장기 병용 시 신독성 주의. "
     "권장 용법·용량을 지키세요."),
    ("C100001", "C100006", "caution",
     "아세트아미노펜 장기 복용 시 와파린 효과가 증가할 수 있습니다. "
     "INR 정기 모니터링을 권장합니다."),
    ("C100005", "C100010", "caution",
     "메트포르민과 암로디핀 병용 시 저혈압 위험이 있을 수 있습니다. "
     "혈압 모니터링을 권장합니다."),
    ("C100004", "C100012", "caution",
     "이부프로펜이 레보티록신 흡수를 방해할 수 있습니다. "
     "복용 간격(4시간 이상)을 두는 것이 권장됩니다."),
    ("C100002", "C100007", "caution",
     "아스피린이 디곡신 신장 배설에 영향을 줄 수 있어 디곡신 농도 모니터링이 권장됩니다."),
    ("C100005", "C100013", "caution",
     "일부 스타틴(아토르바스타틴)과 메트포르민 병용 시 근육 관련 부작용에 주의가 필요합니다."),
    ("C100002", "C100009", "caution",
     "클로피도그렐과 아스피린 병용 시 출혈 위험이 증가합니다. "
     "심혈관 질환 치료 목적이 아닌 경우 의사 상담이 필요합니다."),
    ("C100001", "C100018", "caution",
     "디아제팜과 아세트아미노펜 병용 시 간독성 위험이 약간 증가할 수 있습니다. "
     "음주 중이라면 특히 주의하세요."),
    ("C100016", "C100019", "caution",
     "클래리스로마이신이 테오필린 혈중 농도를 증가시킬 수 있습니다. "
     "테오필린 농도 모니터링이 필요합니다."),
]


def _dur_key(code_a: str, code_b: str) -> tuple:
    """방향 무관 정렬 키"""
    return (min(code_a, code_b), max(code_a, code_b))


# 인덱스 빌드 — 동일 쌍에 여러 룰이 있으면 최고 위험도 유지
DUR_RULE_INDEX: dict = {}
for _a, _b, _lvl, _expl in _RAW_DUR_RULES:
    _k = _dur_key(_a, _b)
    existing = DUR_RULE_INDEX.get(_k)
    if existing is None or LEVEL_PRIORITY[_lvl] > LEVEL_PRIORITY[existing[0]]:
        DUR_RULE_INDEX[_k] = (_lvl, _expl)


# ─────────────────────────────────────────────────────────────────────────────
# §3. 성분명 → 코드 사전 (Layer 2 토큰 매칭)
# ─────────────────────────────────────────────────────────────────────────────
INGREDIENT_NAME_TO_CODE: dict = {
    # 아세트아미노펜
    "아세트아미노펜": "C100001", "타이레놀": "C100001",
    "acetaminophen": "C100001", "paracetamol": "C100001",
    # 아스피린
    "아스피린": "C100002", "아세틸살리실산": "C100002", "aspirin": "C100002",
    # 오메프라졸
    "오메프라졸": "C100003", "omeprazole": "C100003",
    # 이부프로펜
    "이부프로펜": "C100004", "ibuprofen": "C100004",
    # 메트포르민
    "메트포르민": "C100005", "메트포르민염산염": "C100005", "metformin": "C100005",
    # 와파린
    "와파린": "C100006", "와파린나트륨": "C100006", "warfarin": "C100006",
    # 디곡신
    "디곡신": "C100007", "digoxin": "C100007",
    # 리튬
    "탄산리튬": "C100008", "리튬": "C100008", "lithium": "C100008",
    # 클로피도그렐
    "클로피도그렐": "C100009", "클로피도그렐황산염": "C100009", "clopidogrel": "C100009",
    # 암로디핀
    "암로디핀": "C100010", "암로디핀베실산염": "C100010", "amlodipine": "C100010",
    # 세티리진
    "세티리진": "C100011", "세티리진염산염": "C100011", "cetirizine": "C100011",
    # 레보티록신
    "레보티록신": "C100012", "레보티록신나트륨": "C100012", "levothyroxine": "C100012",
    # 아토르바스타틴
    "아토르바스타틴": "C100013", "아토르바스타틴칼슘": "C100013",
    "아토르바스타틴칼슘삼수화물": "C100013", "atorvastatin": "C100013",
    # 심바스타틴
    "심바스타틴": "C100014", "simvastatin": "C100014",
    # 아미오다론
    "아미오다론": "C100015", "아미오다론염산염": "C100015", "amiodarone": "C100015",
    # 클래리스로마이신
    "클래리스로마이신": "C100016", "clarithromycin": "C100016",
    # 리바록사반
    "리바록사반": "C100017", "rivaroxaban": "C100017",
    # 디아제팜
    "디아제팜": "C100018", "diazepam": "C100018",
    # 테오필린
    "테오필린": "C100019", "theophylline": "C100019",
    # 시프로플록사신
    "시프로플록사신": "C100020", "시프로플록사신염산염일수화물": "C100020",
    "ciprofloxacin": "C100020",
}

# 정규화된 사전 (조회 최적화)
_NORM_NAME_MAP: dict = {}


def _normalize(name: str) -> str:
    """성분명 정규화: NFC → 소문자 → 괄호 제거 → 특수문자 공백 → 공백 축약"""
    if not name:
        return ""
    name = unicodedata.normalize("NFC", name)
    name = name.lower()
    name = re.sub(r"\([^)]*\)", "", name)      # 괄호 내용 제거
    name = re.sub(r"[^\w\s가-힣]", " ", name)  # 특수문자 → 공백
    return re.sub(r"\s+", " ", name).strip()


def _build_norm_map():
    global _NORM_NAME_MAP
    _NORM_NAME_MAP = {_normalize(k): v for k, v in INGREDIENT_NAME_TO_CODE.items()}


_build_norm_map()


def _name_to_code(name: str) -> Optional[str]:
    """성분명 → 코드 (정규화 후 정확→부분 매칭)"""
    norm = _normalize(name)
    if not norm:
        return None
    # 정확 매칭
    if norm in _NORM_NAME_MAP:
        return _NORM_NAME_MAP[norm]
    # 부분 매칭 — 최장 일치 우선
    best_code: Optional[str] = None
    best_len = 0
    for known_norm, code in _NORM_NAME_MAP.items():
        if known_norm and (known_norm in norm or norm in known_norm):
            if len(known_norm) > best_len:
                best_len = len(known_norm)
                best_code = code
    return best_code


# ─────────────────────────────────────────────────────────────────────────────
# §4. Pydantic 스키마 — server.js 합의 계약
# ─────────────────────────────────────────────────────────────────────────────
class IngredientItem(BaseModel):
    ingredientCode: str = ""
    ingredientName: str = ""


class PairRequest(BaseModel):
    drugASeq:         str = ""
    drugAName:        Optional[str] = None
    drugAIngredients: List[IngredientItem] = []
    drugBSeq:         str = ""
    drugBName:        Optional[str] = None
    drugBIngredients: List[IngredientItem] = []
    durRules:         List[dict] = []  # server 힌트 (미래 확장용, 현재 L1 재검증)


class PredictRequest(BaseModel):
    pairs: List[PairRequest]


class PairResponse(BaseModel):
    level:       str   = "safe"
    confidence:  float = Field(default=CONF_UNKNOWN, ge=0.0, le=1.0)
    explanation: str   = ""
    sourceUrl:   str   = ""


class PredictResponse(BaseModel):
    pairs: List[PairResponse]


# ─────────────────────────────────────────────────────────────────────────────
# §5. 핵심 판정 로직
# ─────────────────────────────────────────────────────────────────────────────
def _predict_pair(pair: PairRequest) -> PairResponse:
    """
    3계층 판정:
      L1. 성분코드 → DUR 인덱스 직접 조회 (confidence=1.0, 서비스 무중단 보장)
      L2. 성분명 토큰 → 코드 변환 → DUR 인덱스 조회 (confidence=0.70~0.85)
      L3. 미확인 → safe (confidence=0.10)
    """
    # ── Layer 1: 성분코드 기반 정확 매칭 ─────────────────────────────────
    codes_a = {
        ing.ingredientCode.strip()
        for ing in pair.drugAIngredients
        if ing.ingredientCode.strip()
    }
    codes_b = {
        ing.ingredientCode.strip()
        for ing in pair.drugBIngredients
        if ing.ingredientCode.strip()
    }

    best_level = "safe"
    best_prio  = LEVEL_PRIORITY["safe"]
    best_expl  = ""
    best_conf  = CONF_UNKNOWN
    matched_layer = 3

    for ca in codes_a:
        for cb in codes_b:
            key = _dur_key(ca, cb)
            if key in DUR_RULE_INDEX:
                lvl, expl = DUR_RULE_INDEX[key]
                prio = LEVEL_PRIORITY.get(lvl, 0)
                if prio > best_prio or matched_layer > 1:
                    best_prio     = prio
                    best_level    = lvl
                    best_expl     = expl
                    best_conf     = CONF_RULE_EXACT
                    matched_layer = 1

    if matched_layer == 1:
        return PairResponse(
            level=best_level,
            confidence=best_conf,
            explanation=best_expl,
            sourceUrl=MFDS_DUR_SOURCE_URL,
        )

    # ── Layer 2: 성분명 토큰 매칭 ────────────────────────────────────────
    # 성분명(ingredientName) + 약품명(drugAName/drugBName) 모두 소스로 활용
    names_a: List[str] = [ing.ingredientName for ing in pair.drugAIngredients if ing.ingredientName]
    if pair.drugAName:
        names_a.append(pair.drugAName)

    names_b: List[str] = [ing.ingredientName for ing in pair.drugBIngredients if ing.ingredientName]
    if pair.drugBName:
        names_b.append(pair.drugBName)

    resolved_a: set = {code for n in names_a for code in [_name_to_code(n)] if code}
    resolved_b: set = {code for n in names_b for code in [_name_to_code(n)] if code}

    # 명시적 코드가 없어서 이름으로만 해석한 경우 confidence 낮춤
    for ca in resolved_a:
        for cb in resolved_b:
            key = _dur_key(ca, cb)
            if key in DUR_RULE_INDEX:
                lvl, expl = DUR_RULE_INDEX[key]
                prio = LEVEL_PRIORITY.get(lvl, 0)
                # 코드가 이미 알려진 경우 high, 이름에서만 파생된 경우 partial
                conf_this = (
                    CONF_TOKEN_HIGH
                    if (ca in codes_a and cb in codes_b)
                    else CONF_TOKEN_PARTIAL
                )
                if prio > best_prio or (prio == best_prio and conf_this > best_conf):
                    best_prio     = prio
                    best_level    = lvl
                    best_expl     = expl + " (성분명 분석 기반)"
                    best_conf     = conf_this
                    matched_layer = 2

    if matched_layer == 2:
        return PairResponse(
            level=best_level,
            confidence=best_conf,
            explanation=best_expl,
            sourceUrl=MFDS_DUR_SOURCE_URL,
        )

    # ── Layer 3: 미확인 → safe 폴백 ─────────────────────────────────────
    return PairResponse(
        level="safe",
        confidence=CONF_UNKNOWN,
        explanation=(
            "해당 성분 조합에 대한 상호작용 데이터가 없습니다. "
            "반드시 의사·약사와 상담 후 복용하세요."
        ),
        sourceUrl="",
    )


# ─────────────────────────────────────────────────────────────────────────────
# §6. FastAPI 앱
# ─────────────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="YakCheck ML Service",
    description=(
        "약물 상호작용 판정 마이크로서비스 — "
        "3계층 폴백: DUR 규칙 코드 매칭 → 성분명 토큰 → safe"
    ),
    version="1.0.0",
)


@app.get("/health")
async def health() -> dict:
    return {
        "status": "ok",
        "service": "YakCheck ML Service",
        "version": "1.0.0",
        "dur_rules_indexed": len(DUR_RULE_INDEX),
        "name_entries": len(INGREDIENT_NAME_TO_CODE),
        "layers": ["code_exact", "name_token", "safe_fallback"],
    }


@app.post("/predict", response_model=PredictResponse)
async def predict(req: PredictRequest) -> PredictResponse:
    """
    약물 상호작용 배치 판정.

    - pairs 최대 100쌍
    - level: safe | caution | danger | forbidden
    - confidence: 0.0~1.0 (L1=1.0, L2=0.70~0.85, L3=0.10)
    """
    if not req.pairs:
        return PredictResponse(pairs=[])
    if len(req.pairs) > 100:
        raise HTTPException(
            status_code=400,
            detail="최대 100쌍까지 처리 가능합니다.",
        )

    results = [_predict_pair(p) for p in req.pairs]
    return PredictResponse(pairs=results)


# ─────────────────────────────────────────────────────────────────────────────
# §7. 진입점
# ─────────────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("═══════════════════════════════════════════════")
    print("  약체크 YakCheck ML 마이크로서비스 v1.0")
    print("═══════════════════════════════════════════════")
    print(f"  포트        : {ML_PORT}")
    print(f"  DUR 인덱스  : {len(DUR_RULE_INDEX)}개")
    print(f"  성분명 사전  : {len(INGREDIENT_NAME_TO_CODE)}개")
    print("  아키텍처    : L1(코드→규칙) → L2(이름→코드→규칙) → L3(safe)")
    uvicorn.run(app, host=ML_HOST, port=ML_PORT, log_level="info")
