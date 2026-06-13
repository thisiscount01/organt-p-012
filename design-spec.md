# Design Spec — 약물 상호작용 검사 서비스
> **대상**: 프론트엔드 구현팀 / QA  
> **기준일**: 2026-06-13  
> **서비스명**: 약체크 (YakCheck)  
> **원칙**: Progressive Disclosure · 오류 원인 귀속 명확성 · 3중 위험 표현 (색+아이콘+텍스트)

---

## 0. 문서 사용 가이드

이 문서만으로 컴포넌트를 구현하고 접근성 QA까지 끝낼 수 있도록 설계되었습니다.  
- **§1** 토큰 → CSS/JS 변수 선언에 그대로 붙여 넣으세요.  
- **§2** 시선 동선 → 화면 레이아웃 구조 설계에 사용하세요.  
- **§3** 상태 정의표 → 각 상태의 시각 언어를 1:1로 구현하세요.  
- **§4** 컴포넌트 명세 → Props·HTML·CSS를 명세대로 구현하세요.  
- **§5** 접근성 → 그레이스케일·키보드·스크린 리더 기준 체크리스트.

---

## 1. 디자인 토큰

### 1-1. 위험도 색상 (Risk Level Colors)

위험도는 **색+아이콘+텍스트 3중 표현**을 항상 함께 써야 합니다. 색만 단독으로 위험도를 나타내지 마세요.

```css
/* === Risk Level Tokens === */

/* L1 안전 (Safe) — 초록 계열 */
--risk-safe-bg:      #DCFCE7;   /* 배지 배경 */
--risk-safe-border:  #22C55E;   /* 배지 테두리 */
--risk-safe-icon:    #16A34A;   /* 아이콘 색 */
--risk-safe-text:    #14532D;   /* 텍스트 색 */
--risk-safe-dark-bg: #166534;   /* 다크모드 배경 */

/* L2 주의 (Caution) — 앰버 계열 */
--risk-caution-bg:      #FEF9C3;
--risk-caution-border:  #EAB308;
--risk-caution-icon:    #CA8A04;
--risk-caution-text:    #713F12;
--risk-caution-dark-bg: #78350F;

/* L3 위험 (Danger) — 오렌지-레드 계열 */
--risk-danger-bg:      #FEE2E2;
--risk-danger-border:  #EF4444;
--risk-danger-icon:    #DC2626;
--risk-danger-text:    #7F1D1D;
--risk-danger-dark-bg: #991B1B;

/* L4 금기 (Contraindicated) — 딥 퍼플-크림슨 계열 */
--risk-forbidden-bg:      #F3E8FF;
--risk-forbidden-border:  #9333EA;
--risk-forbidden-icon:    #7E22CE;
--risk-forbidden-text:    #3B0764;
--risk-forbidden-dark-bg: #4C1D95;
```

> **그레이스케일 명암비 확보 전략**  
> 위 4색은 그레이스케일 변환 시 명도(L*)가 각각  
> 안전 L*≈88, 주의 L*≈78, 위험 L*≈66, 금기 L*≈53  
> 으로 계단식 차이(≥10)를 유지합니다. 색 외에 **아이콘 형태**가 반드시 다르게 표현되어야 합니다 (§5 참조).

---

### 1-2. 의미 색상 (Semantic Colors)

```css
/* 브랜드 */
--color-brand-500: #3B82F6;   /* 인터랙티브 요소 기본 */
--color-brand-600: #2563EB;   /* hover */
--color-brand-700: #1D4ED8;   /* pressed */
--color-brand-50:  #EFF6FF;   /* 배경 강조 */

/* 중립 */
--color-neutral-50:  #F9FAFB;
--color-neutral-100: #F3F4F6;
--color-neutral-200: #E5E7EB;
--color-neutral-300: #D1D5DB;
--color-neutral-400: #9CA3AF;
--color-neutral-500: #6B7280;
--color-neutral-600: #4B5563;
--color-neutral-700: #374151;
--color-neutral-800: #1F2937;
--color-neutral-900: #111827;

/* 시스템 상태 */
--color-info-bg:     #EFF6FF;
--color-info-icon:   #3B82F6;
--color-info-text:   #1E40AF;

--color-user-error-bg:    #FFF7ED;   /* 오입력: 앰버(주황) */
--color-user-error-icon:  #F97316;
--color-user-error-text:  #9A3412;

--color-sys-error-bg:    #FFF1F2;    /* 시스템 오류: 레드 (다른 시각 언어) */
--color-sys-error-icon:  #E11D48;
--color-sys-error-text:  #881337;

--color-empty-bg:    #F9FAFB;
--color-empty-icon:  #9CA3AF;
--color-empty-text:  #4B5563;
```

> **핵심 규약 — 오류 원인 귀속**  
> - **오입력(사용자 실수)**: 오렌지 계열(`--color-user-error-*`) + 느낌표 삼각형 아이콘  
> - **시스템 오류(서버·타임아웃)**: 레드-핑크 계열(`--color-sys-error-*`) + 톱니바퀴 아이콘  
> 두 상태를 절대 같은 색·아이콘으로 처리하지 마세요.

---

### 1-3. 타이포그래피

```css
/* 폰트 패밀리 */
--font-sans:  'Pretendard Variable', 'Pretendard', -apple-system, sans-serif;
--font-mono:  'JetBrains Mono', 'Fira Code', monospace;  /* 약물 코드·ID */

/* 스케일 (Fluid Type) */
--text-xs:   0.75rem;   /* 12px — 라벨·캡션 */
--text-sm:   0.875rem;  /* 14px — 보조 본문 */
--text-base: 1rem;      /* 16px — 본문 (최소 가독 기준) */
--text-lg:   1.125rem;  /* 18px — 강조 본문 */
--text-xl:   1.25rem;   /* 20px — 소제목 */
--text-2xl:  1.5rem;    /* 24px — 섹션 제목 */
--text-3xl:  1.875rem;  /* 30px — 히어로 소제목 */
--text-4xl:  2.25rem;   /* 36px — 히어로 타이틀 */

/* 굵기 */
--font-normal:   400;
--font-medium:   500;
--font-semibold: 600;
--font-bold:     700;

/* 행간 */
--leading-tight:   1.25;
--leading-snug:    1.375;
--leading-normal:  1.5;
--leading-relaxed: 1.625;

/* 자간 */
--tracking-tight:  -0.025em;
--tracking-normal:  0;
--tracking-wide:    0.025em;
```

---

### 1-4. 간격 (Spacing — 4px 기본 그리드)

```css
--space-1:  0.25rem;   /*  4px */
--space-2:  0.5rem;    /*  8px */
--space-3:  0.75rem;   /* 12px */
--space-4:  1rem;      /* 16px */
--space-5:  1.25rem;   /* 20px */
--space-6:  1.5rem;    /* 24px */
--space-8:  2rem;      /* 32px */
--space-10: 2.5rem;    /* 40px */
--space-12: 3rem;      /* 48px */
--space-16: 4rem;      /* 64px */
--space-20: 5rem;      /* 80px */
--space-24: 6rem;      /* 96px */

/* 컴포넌트별 고정값 */
--radius-sm:   4px;
--radius-md:   8px;
--radius-lg:   12px;
--radius-xl:   16px;
--radius-full: 9999px;

--shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
--shadow-md: 0 4px 6px -1px rgba(0,0,0,0.1), 0 2px 4px -1px rgba(0,0,0,0.06);
--shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.1), 0 4px 6px -2px rgba(0,0,0,0.05);
--shadow-xl: 0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04);
```

---

### 1-5. 아이콘 셋

Lucide Icons (MIT 라이센스) 기준. 위험도별 아이콘은 **형태가 달라야** 합니다.

| 용도 | 아이콘 이름 | SVG 형태 설명 | 크기 |
|------|------------|--------------|------|
| L1 안전 | `CheckCircle2` | 원 안에 체크마크 | 20px |
| L2 주의 | `AlertTriangle` | 삼각형+느낌표 | 20px |
| L3 위험 | `OctagonAlert` | 팔각형+느낌표 | 20px |
| L4 금기 | `Ban` | 원+사선 (통행금지) | 20px |
| 검색 | `Search` | 돋보기 | 20px |
| 약 추가 | `Plus` | 플러스 | 16px |
| 약 제거 | `X` | X 마크 | 14px |
| 시스템 오류 | `ServerCrash` | 서버+번개 | 24px |
| 오입력 | `TriangleAlert` | 삼각+느낌표 (오렌지) | 24px |
| 데이터 없음 | `SearchX` | 돋보기+X | 32px |
| 로딩 | `Loader2` | 원형 스피너 | 20px |
| 약물 정보 | `Pill` | 캡슐 형태 | 18px |
| 상호작용 | `ArrowLeftRight` | 좌우 화살표 | 18px |
| 닫기 | `X` | X 마크 | 16px |
| 정보 | `Info` | 원+i | 16px |
| 외부 링크 | `ExternalLink` | 화살표+박스 | 14px |
| 새로고침 | `RefreshCw` | 원형 화살표 | 16px |

> 아이콘 구현 시 `aria-hidden="true"` + 별도 `<span class="sr-only">` 텍스트 필수.  
> 크기 토큰: `--icon-sm: 16px` / `--icon-md: 20px` / `--icon-lg: 24px` / `--icon-xl: 32px`

---

### 1-6. 전환·애니메이션 토큰

```css
/* 지속 시간 */
--duration-instant: 0ms;
--duration-fast:    100ms;
--duration-normal:  200ms;
--duration-slow:    300ms;
--duration-slower:  500ms;

/* 이징 */
--ease-linear:  linear;
--ease-in:      cubic-bezier(0.4, 0, 1, 1);
--ease-out:     cubic-bezier(0, 0, 0.2, 1);
--ease-in-out:  cubic-bezier(0.4, 0, 0.2, 1);
--ease-spring:  cubic-bezier(0.34, 1.56, 0.64, 1);  /* 칩 추가 시 */

/* 키프레임 */
@keyframes spin {
  to { transform: rotate(360deg); }
}
@keyframes fadeIn {
  from { opacity: 0; transform: translateY(4px); }
  to   { opacity: 1; transform: translateY(0); }
}
@keyframes chipIn {
  from { opacity: 0; transform: scale(0.8); }
  to   { opacity: 1; transform: scale(1); }
}
@keyframes chipOut {
  to { opacity: 0; transform: scale(0.8); max-width: 0; margin: 0; padding: 0; }
}
@keyframes shake {
  0%, 100% { transform: translateX(0); }
  20%       { transform: translateX(-6px); }
  40%       { transform: translateX(6px); }
  60%       { transform: translateX(-4px); }
  80%       { transform: translateX(4px); }
}
@keyframes resultCardIn {
  from { opacity: 0; transform: translateY(12px) scale(0.98); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes errorPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(225, 29, 72, 0.3); }
  50%       { box-shadow: 0 0 0 6px rgba(225, 29, 72, 0); }
}
```

---

## 2. 주요 5개 화면 시선 동선

시선 동선은 **F-패턴**(상단→좌측→하단)과 **Z-패턴**(히어로 영역)을 혼합합니다.  
초기 화면은 핵심 3요소만 노출합니다(Progressive Disclosure).

---

### Screen 1 — 온보딩 / 첫화면

```
┌─────────────────────────────────────────────────────────────┐
│  [1] 로고 + 서비스명                         최상단 좌측     │
│      약체크  YakCheck                                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│         [2] 히어로 텍스트 (중앙 정렬, Z-패턴 시작점)         │
│              먹는 약, 함께 먹어도 될까요?                    │
│              약 이름을 검색해 상호작용을 확인하세요           │
│                                                              │
│         [3] 검색바 (최대 폭 640px, 화면 중앙)               │
│         ┌──────────────────────────────┬──────┐              │
│         │  약 이름을 입력하세요         │ 검색 │              │
│         └──────────────────────────────┴──────┘              │
│              ↑ 시선 목적지 #1 (Primary CTA)                  │
│                                                              │
│         [미표시] 추가 정보는 약 추가 후 Progressive 공개      │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│  [4] 최하단 footer: 면책 문구 (12px, neutral-400)            │
│  본 서비스는 의료 조언을 대체하지 않습니다 · 식약처 데이터   │
└─────────────────────────────────────────────────────────────┘

시선 동선: [1] 로고 → [2] 히어로 텍스트 → [3] 검색바 (CTA)
최초 3초 내 사용자가 '뭘 해야 하는지' 파악 가능해야 합니다.
검색 입력 필드에 자동 포커스(autofocus) 필수.
```

**레이아웃 수치**:
- 로고: `--text-2xl` 32px, `--font-semibold`, `--color-brand-600`
- 히어로 타이틀: `--text-3xl`~`--text-4xl` (반응형), `--font-bold`, neutral-900, `--tracking-tight`
- 히어로 서브: `--text-lg` 18px, neutral-500, `--leading-relaxed`
- 검색바: max-width 640px, 높이 56px, 중앙 정렬
- 로고~타이틀 간격: `--space-16` 64px
- 타이틀~서브 간격: `--space-3` 12px
- 서브~검색바 간격: `--space-8` 32px

---

### Screen 2 — 검색 (드롭다운 활성)

```
┌─────────────────────────────────────────────────────────────┐
│  로고                                                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│         ┌──────────────────────────────┬──────┐              │
│         │  타이레놀_                    │  검색│ ← [1] 포커스 │
│         └──────────────────────────────┴──────┘              │
│         ┌──────────────────────────────────────┐             │
│         │ [Pill] 타이레놀 500mg (아세트아미노펜)│ ← [2] 1순위 │
│         │ [Pill] 타이레놀 ER 650mg             │             │
│         │ [Pill] 어린이 타이레놀 160mg/5mL 시럽│             │
│         │ ───────────────────────────────────  │             │
│         │ [시계] 최근 검색: 아스피린 · 오메프라졸│ ← [3] 보조 │
│         └──────────────────────────────────────┘             │
│                                                              │
└─────────────────────────────────────────────────────────────┘

시선 동선: [1] 입력 커서 → [2] 드롭다운 1번 결과 → [3] 최근 검색
키보드: ↑↓ 탐색, Enter 선택, Esc 닫기
```

**드롭다운 명세**:
- 최대 표시 항목: 7개, `overflow-y: auto; max-height: 280px`
- 각 항목 높이: 48px, 좌 padding `--space-4`
- 일치 문자 강조: `--font-bold` + `--color-brand-600`
- 최근 검색 구분선: neutral-200, 1px
- 드롭다운 shadow: `--shadow-xl`
- 애니메이션: `fadeIn` 100ms ease-out

---

### Screen 3 — 약 목록 (다중 약 추가 상태)

```
┌─────────────────────────────────────────────────────────────┐
│  로고                                     [결과 보기 버튼]   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  추가된 약 (3개)                     [전체 삭제]             │
│  ┌───────────────┐ ┌─────────────┐ ┌────────────────┐        │
│  │[Pill] 타이레놀│X│ [Pill] 아스피린│X│[Pill] 오메프라졸│X│ ← [1] │
│  └───────────────┘ └─────────────┘ └────────────────┘        │
│                                                              │
│  [2] 검색바 (계속 노출, 약 추가 계속 가능)                   │
│  ┌──────────────────────────────┬──────┐                      │
│  │  약 추가하기...               │ 검색 │                      │
│  └──────────────────────────────┴──────┘                      │
│                                                              │
│  ─────────────────────────────────────────                    │
│  [i] 2개 이상 약을 추가하면 상호작용을 분석합니다            │
│                                                              │
│  [3] 상호작용 분석하기 (Primary CTA, 2개↑ 시 활성)          │
│  ┌──────────────────────────────────────────────────┐         │
│  │       [아이콘] 상호작용 분석하기  →               │         │
│  └──────────────────────────────────────────────────┘         │
│                                                              │
└─────────────────────────────────────────────────────────────┘

시선 동선: [1] 약 칩 목록 확인 → [2] 추가 검색바 → [3] 분석 CTA
```

**상태 분기**:
- 약 0개: CTA 비활성 (neutral-300), 검색바만 강조
- 약 1개: CTA 비활성 + 안내 "약을 1개 더 추가하면 분석 가능합니다"
- 약 2~10개: CTA 활성 (`--color-brand-600`)
- 약 11개 이상: toast "최대 10개까지 분석 가능합니다", 추가 막음

---

### Screen 4 — 결과 (위험도 표시)

```
┌─────────────────────────────────────────────────────────────┐
│  로고                         [다시 분석]  [약 목록 편집]    │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  [1] 분석 약 요약 칩 (상단 고정)                            │
│  [Pill] 타이레놀   [Pill] 아스피린   [Pill] 오메프라졸       │
│                                                              │
│  ─────────────────────────────────────────                   │
│                                                              │
│  [2] 종합 판정 배지 (화면 중앙, 가장 큰 시각 요소)           │
│  ┌────────────────────────────────────────┐                   │
│  │        [Ban 40px]                      │                   │
│  │           금기                         │ ← L4 forbidden   │
│  │  CONTRAINDICATED                       │                   │
│  │  타이레놀 + 아스피린 병용은 금기입니다 │                   │
│  └────────────────────────────────────────┘                   │
│                                                              │
│  [의료 경고 배너 — L3/L4 시 자동 삽입]                       │
│  [i] 이 결과는 참고용입니다. 의사·약사와 반드시 상담하세요.  │
│                                                              │
│  [3] 상호작용 상세 카드 (스크롤)                            │
│  ┌──────────────────────────────────────────────────┐         │
│  │  타이레놀 ↔ 아스피린           [Ban] [금기]      │         │
│  │  아세트아미노펜과 아스피린 병용 시 위장관 출혈...  │         │
│  │  [식약처 근거 보기 ↗]                             │         │
│  └──────────────────────────────────────────────────┘         │
│  ┌──────────────────────────────────────────────────┐         │
│  │  아스피린 ↔ 오메프라졸    [AlertTriangle] [주의] │         │
│  │  프로톤 펌프 억제제와 NSAIDs 병용 주의...         │         │
│  │  [식약처 근거 보기 ↗]                             │         │
│  └──────────────────────────────────────────────────┘         │
│                                                              │
│  [4] 면책 고지 (하단)                                        │
│  [i] 의사·약사와 상담을 권장합니다. 식약처 데이터 기준.      │
│                                                              │
└─────────────────────────────────────────────────────────────┘

시선 동선: [1] 분석 약 확인 → [2] 종합 판정 → [3] 상세 카드
가장 심각한 위험 등급을 종합 판정에 표시합니다 (최고 위험 원칙).
```

---

### Screen 5 — 오류 상태 (2종)

#### 5-A. 오입력 실패 (사용자 실수)

```
┌─────────────────────────────────────────────────────────────┐
│  로고                                                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────────────────────────────────────────┐         │
│  │  zxcvbnm_                                        │ ← 입력  │
│  └──────────────────────────────────────────────────┘         │
│                                                              │
│  ┌──────────────────────────────────────────────────┐         │
│  │ [TriangleAlert]  검색어를 확인해주세요   (오렌지)│         │
│  │  'zxcvbnm'에 해당하는 약을 찾지 못했습니다      │         │
│  │  한글·영문 약 이름 또는 성분명으로 검색하세요   │         │
│  │                                                  │         │
│  │  검색 예시  [타이레놀]  [아스피린]  [아세트아미노펜]│      │
│  └──────────────────────────────────────────────────┘         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### 5-B. 시스템 오류 (서버·타임아웃)

```
┌─────────────────────────────────────────────────────────────┐
│  로고                                                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│           ┌──────────────────────────────────┐               │
│           │ [ServerCrash]  서비스 오류  (레드)│               │
│           │  잠시 후 다시 시도해주세요        │               │
│           │  문제가 지속되면 관리자에게 문의  │               │
│           │                                  │               │
│           │  [다시 시도]  [홈으로]            │               │
│           │  입력하신 약 목록은 유지됩니다    │               │
│           └──────────────────────────────────┘               │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**핵심 차별화 요약**:

| 항목 | 오입력 (5-A) | 시스템 오류 (5-B) |
|------|-------------|------------------|
| 배경색 | `--color-user-error-bg` (오렌지) | `--color-sys-error-bg` (레드-핑크) |
| 아이콘 | `TriangleAlert` (삼각+!) | `ServerCrash` (서버+번개) |
| 메시지 | "검색어를 확인해주세요" | "서비스 오류가 발생했습니다" |
| 책임 주체 | 사용자 행동 유도 | 시스템 책임 명시 |
| 애니메이션 | 입력창 shake 200ms | errorPulse 1.5s × 3회 |
| 복구 방법 | 재입력 안내·예시 | [다시 시도] 버튼 |

---

## 3. 상태 정의표

### 3-1. 검색 상태

| 상태 ID | 상태명 | 배경 | 아이콘 | 아이콘 색 | 메시지 | 애니메이션 |
|---------|--------|------|--------|-----------|--------|-----------|
| `SEARCH_IDLE` | 대기 | transparent | `Search` | neutral-400 | "약 이름을 입력하세요" (placeholder) | 없음 |
| `SEARCH_TYPING` | 입력 중 | white | `Search` | brand-500 | 입력값 표시 | 없음 |
| `SEARCH_LOADING` | 검색 중 | white | `Loader2` (회전) | brand-500 | "검색 중..." | spin 1s linear infinite |
| `SEARCH_SUCCESS` | 결과 있음 | white | `Search` | brand-500 | 드롭다운 결과 표시 | fadeIn 100ms |
| `SEARCH_EMPTY` | 결과 없음 | color-empty-bg | `SearchX` | neutral-400 | "검색 결과가 없습니다" | fadeIn 150ms |
| `SEARCH_USER_ERROR` | 오입력 | color-user-error-bg | `TriangleAlert` | color-user-error-icon | "검색어를 확인해주세요" | shake 200ms |
| `SEARCH_SYS_ERROR` | 시스템 오류 | color-sys-error-bg | `ServerCrash` | color-sys-error-icon | "검색 서비스 오류 · 잠시 후 재시도" | errorPulse 1.5s |

---

### 3-2. 분석 상태

| 상태 ID | 상태명 | 색 | 아이콘 | 메시지 | 애니메이션 |
|---------|--------|---|--------|--------|-----------|
| `ANALYSIS_IDLE` | 분석 전 | neutral-200 (버튼) | `ArrowLeftRight` | "상호작용 분석하기" | 없음 |
| `ANALYSIS_LOADING` | 분석 중 | brand-500 (버튼) | `Loader2` (회전) | "분석 중..." | spin + 버튼 disabled |
| `ANALYSIS_SAFE` | 안전 | risk-safe-* | `CheckCircle2` | "안전 — 주요 상호작용 없음" | resultCardIn 300ms |
| `ANALYSIS_CAUTION` | 주의 | risk-caution-* | `AlertTriangle` | "주의 — 복용 전 약사 확인 권장" | resultCardIn 300ms |
| `ANALYSIS_DANGER` | 위험 | risk-danger-* | `OctagonAlert` | "위험 — 의사 처방 필요" | resultCardIn 300ms |
| `ANALYSIS_FORBIDDEN` | 금기 | risk-forbidden-* | `Ban` | "금기 — 병용 금지" | resultCardIn 300ms |
| `ANALYSIS_SYS_ERROR` | 시스템 오류 | sys-error-* | `ServerCrash` | "분석 오류 · 다시 시도" | errorPulse |
| `ANALYSIS_EMPTY` | 데이터 없음 | empty-* | `SearchX` | "해당 조합의 상호작용 데이터가 없습니다" | fadeIn |
| `ANALYSIS_FALLBACK` | 룰 기반 폴백 | (정상 표시 유지) | 정상 아이콘 | 정상 메시지 + 하단 배지 "규칙 기반 결과" | resultCardIn 300ms |

> **룰 기반 폴백 규약**: ML 추론 실패 시 식약처 병용금기 룰 DB 자동 전환.  
> 활성 중 결과 카드 하단에 소형 배지 `[i] 규칙 기반 결과` (neutral-500, text-xs) 표시.  
> 폴백 자체는 사용자에게 오류처럼 보여선 안 됩니다 — 결과는 정상 표시하고 출처만 표기.

---

### 3-3. 약 칩 상태

| 상태 ID | 설명 | 배경 | 텍스트 | 테두리 | 애니메이션 |
|---------|------|------|--------|--------|-----------|
| `CHIP_DEFAULT` | 기본 | neutral-100 | neutral-700 | neutral-200 | chipIn 200ms ease-spring |
| `CHIP_HOVER` | 마우스 오버 | neutral-200 | neutral-800 | neutral-300 | 없음 |
| `CHIP_FOCUS` | 키보드 포커스 | neutral-100 | neutral-800 | brand-500 2px offset 2px | 없음 |
| `CHIP_REMOVING` | 삭제 중 | neutral-50 | neutral-400 | neutral-200 | chipOut 100ms ease-in |
| `CHIP_REMOVED` | 삭제 완료 | — | — | — | (DOM 제거) |

---

## 4. 컴포넌트 명세

### 4-1. 검색바 (SearchBar)

```html
<div class="search-bar" role="search" aria-label="약 이름 검색">
  <div class="search-input-wrapper" data-state="IDLE">
    <!-- 상태별 아이콘 (좌측) -->
    <span class="search-icon" aria-hidden="true">
      <!-- IDLE/TYPING/SUCCESS: Search -->
      <!-- LOADING: Loader2 class="spin" -->
      <!-- EMPTY: SearchX -->
      <!-- USER_ERROR: TriangleAlert -->
      <!-- SYS_ERROR: ServerCrash -->
    </span>

    <input
      type="search"
      id="drug-search"
      class="search-input"
      placeholder="약 이름을 입력하세요 (예: 타이레놀, 아스피린)"
      autocomplete="off"
      autocorrect="off"
      spellcheck="false"
      autofocus
      aria-label="약 이름 검색"
      aria-autocomplete="list"
      aria-controls="search-dropdown"
      aria-expanded="false"
      aria-activedescendant=""
    />

    <!-- 입력값 있을 때만 표시 -->
    <button class="search-clear" aria-label="검색어 지우기" type="button">
      <span aria-hidden="true"><!-- X 14px --></span>
    </button>

    <button class="search-submit" type="submit" aria-label="검색 실행">
      검색
    </button>
  </div>

  <!-- 오류 메시지 (aria-live) -->
  <div
    id="search-error"
    class="search-error-msg"
    role="alert"
    aria-live="polite"
    aria-atomic="true"
  >
    <!-- 동적 삽입: 오입력/시스템 오류 메시지 -->
  </div>

  <!-- 드롭다운 -->
  <ul
    id="search-dropdown"
    class="search-dropdown"
    role="listbox"
    aria-label="검색 결과"
  >
    <li role="option" id="option-0" aria-selected="false" class="dropdown-item">
      <span class="item-icon" aria-hidden="true"><!-- Pill 16px --></span>
      <span class="item-name">타이레놀 500mg</span>
      <span class="item-ingredient">아세트아미노펜</span>
    </li>
  </ul>
</div>
```

```css
.search-bar {
  position: relative;
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
}

.search-input-wrapper {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  height: 56px;
  padding: 0 var(--space-4);
  background: white;
  border: 2px solid var(--color-neutral-200);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-md);
  transition:
    border-color var(--duration-normal) var(--ease-in-out),
    box-shadow  var(--duration-normal) var(--ease-in-out);
}

.search-input-wrapper:focus-within {
  border-color: var(--color-brand-500);
  box-shadow: 0 0 0 3px rgba(59,130,246,0.15), var(--shadow-md);
}

/* 상태별 테두리 */
.search-input-wrapper[data-state="SEARCH_USER_ERROR"] {
  border-color: var(--color-user-error-icon);
  animation: shake var(--duration-normal) var(--ease-in-out);
}
.search-input-wrapper[data-state="SEARCH_SYS_ERROR"] {
  border-color: var(--color-sys-error-icon);
  animation: errorPulse 1.5s ease-in-out infinite;
}

.search-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: var(--text-base);
  font-family: var(--font-sans);
  color: var(--color-neutral-900);
  background: transparent;
}
.search-input::placeholder { color: var(--color-neutral-400); }

.search-submit {
  flex-shrink: 0;
  height: 40px;
  padding: 0 var(--space-4);
  background: var(--color-brand-600);
  color: white;
  border: none;
  border-radius: var(--radius-lg);
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  cursor: pointer;
  transition: background var(--duration-fast);
}
.search-submit:hover   { background: var(--color-brand-700); }
.search-submit:disabled {
  background: var(--color-neutral-300);
  cursor: not-allowed;
}

.search-dropdown {
  position: absolute;
  top: calc(100% + var(--space-2));
  left: 0; right: 0;
  background: white;
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-xl);
  overflow-y: auto;
  max-height: 280px;
  z-index: 50;
  animation: fadeIn var(--duration-fast) var(--ease-out);
  list-style: none;
  margin: 0;
  padding: var(--space-2) 0;
}

.dropdown-item {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  height: 48px;
  padding: 0 var(--space-4);
  cursor: pointer;
  transition: background var(--duration-fast);
}
.dropdown-item:hover,
.dropdown-item[aria-selected="true"] {
  background: var(--color-brand-50);
}

.search-error-msg {
  margin-top: var(--space-2);
  padding: var(--space-3) var(--space-4);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  display: none;
}
.search-error-msg:not(:empty) {
  display: flex;
  align-items: flex-start;
  gap: var(--space-2);
}
```

---

### 4-2. 약 태그 칩 (DrugChip)

```html
<div
  class="drug-chip"
  data-state="CHIP_DEFAULT"
  role="listitem"
  aria-label="타이레놀 500mg. 제거하려면 Delete 또는 Backspace"
>
  <span class="chip-icon" aria-hidden="true"><!-- Pill 14px --></span>
  <span class="chip-name">타이레놀 500mg</span>
  <button
    class="chip-remove"
    type="button"
    aria-label="타이레놀 500mg 제거"
    tabindex="0"
  >
    <span aria-hidden="true"><!-- X 12px --></span>
  </button>
</div>
```

```css
.drug-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  height: 36px;
  padding: 0 var(--space-3);
  background: var(--color-neutral-100);
  border: 1px solid var(--color-neutral-200);
  border-radius: var(--radius-full);
  font-size: var(--text-sm);
  font-weight: var(--font-medium);
  color: var(--color-neutral-700);
  animation: chipIn var(--duration-normal) var(--ease-spring);
  transition: background var(--duration-fast), border-color var(--duration-fast);
}
.drug-chip:hover {
  background: var(--color-neutral-200);
  border-color: var(--color-neutral-300);
}
.drug-chip:focus-within {
  outline: 2px solid var(--color-brand-500);
  outline-offset: 2px;
}

.chip-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 18px; height: 18px;
  border-radius: var(--radius-full);
  border: none;
  background: transparent;
  color: var(--color-neutral-500);
  cursor: pointer;
  padding: 0;
  transition: background var(--duration-fast), color var(--duration-fast);
}
.chip-remove:hover {
  background: var(--color-neutral-300);
  color: var(--color-neutral-800);
}

.drug-chip[data-state="CHIP_REMOVING"] {
  animation: chipOut var(--duration-fast) var(--ease-in) forwards;
}
```

---

### 4-3. 위험도 배지 (RiskBadge) — 4등급

**구현 원칙**: 색상·아이콘·텍스트 레이블 3가지를 항상 함께 표시.

```html
<!-- L1 안전 -->
<span class="risk-badge risk-badge--safe" role="img" aria-label="위험도: 안전">
  <span class="badge-icon" aria-hidden="true"><!-- CheckCircle2 --></span>
  <span class="badge-text">안전</span>
</span>

<!-- L2 주의 -->
<span class="risk-badge risk-badge--caution" role="img" aria-label="위험도: 주의">
  <span class="badge-icon" aria-hidden="true"><!-- AlertTriangle --></span>
  <span class="badge-text">주의</span>
</span>

<!-- L3 위험 -->
<span class="risk-badge risk-badge--danger" role="img" aria-label="위험도: 위험">
  <span class="badge-icon" aria-hidden="true"><!-- OctagonAlert --></span>
  <span class="badge-text">위험</span>
</span>

<!-- L4 금기 -->
<span class="risk-badge risk-badge--forbidden" role="img" aria-label="위험도: 금기">
  <span class="badge-icon" aria-hidden="true"><!-- Ban --></span>
  <span class="badge-text">금기</span>
</span>
```

```css
.risk-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  height: 24px;
  padding: 0 var(--space-2);
  border-radius: var(--radius-full);
  border: 1.5px solid;
  font-size: var(--text-xs);
  font-weight: var(--font-semibold);
  letter-spacing: var(--tracking-wide);
  white-space: nowrap;
}

.risk-badge--safe {
  background: var(--risk-safe-bg);
  border-color: var(--risk-safe-border);
  color: var(--risk-safe-text);
}
.risk-badge--safe .badge-icon      { color: var(--risk-safe-icon); }

.risk-badge--caution {
  background: var(--risk-caution-bg);
  border-color: var(--risk-caution-border);
  color: var(--risk-caution-text);
}
.risk-badge--caution .badge-icon   { color: var(--risk-caution-icon); }

.risk-badge--danger {
  background: var(--risk-danger-bg);
  border-color: var(--risk-danger-border);
  color: var(--risk-danger-text);
}
.risk-badge--danger .badge-icon    { color: var(--risk-danger-icon); }

.risk-badge--forbidden {
  background: var(--risk-forbidden-bg);
  border-color: var(--risk-forbidden-border);
  color: var(--risk-forbidden-text);
}
.risk-badge--forbidden .badge-icon { color: var(--risk-forbidden-icon); }

/* 대형 배지 — 종합 판정 */
.risk-badge.risk-badge--large {
  height: auto;
  padding: var(--space-6) var(--space-8);
  border-radius: var(--radius-xl);
  border-width: 2px;
  font-size: var(--text-2xl);
  font-weight: var(--font-bold);
  gap: var(--space-3);
  flex-direction: column;
  text-align: center;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
}
.risk-badge.risk-badge--large .badge-icon { width: 40px; height: 40px; }
```

---

### 4-4. 결과 카드 (InteractionCard)

```html
<article
  class="interaction-card interaction-card--forbidden"
  aria-label="타이레놀과 아스피린 상호작용 결과: 금기"
>
  <div class="card-header">
    <div class="card-drug-pair">
      <span class="drug-name">타이레놀</span>
      <span class="pair-arrow" aria-label="와">
        <!-- ArrowLeftRight 16px aria-hidden="true" -->
      </span>
      <span class="drug-name">아스피린</span>
    </div>
    <span class="risk-badge risk-badge--forbidden" role="img" aria-label="위험도: 금기">
      <!-- Ban 14px aria-hidden="true" -->
      <span>금기</span>
    </span>
  </div>

  <div class="card-body">
    <p class="card-description">
      아세트아미노펜과 아스피린 병용 시 위장관 출혈 위험이 증가합니다.
      심혈관 질환 환자에서 특히 주의가 필요합니다.
    </p>
  </div>

  <div class="card-footer">
    <a
      class="card-source-link"
      href="[식약처 원문 URL]"
      target="_blank"
      rel="noopener noreferrer"
      aria-label="식약처 상호작용 근거 새 탭에서 보기"
    >
      <!-- ExternalLink 14px aria-hidden="true" -->
      식약처 근거 보기
    </a>
    <!-- ML 폴백 시에만 표시 -->
    <span class="fallback-badge" aria-label="규칙 기반 분석 결과">
      <!-- Info 12px aria-hidden="true" -->
      규칙 기반 결과
    </span>
  </div>
</article>
```

```css
.interaction-card {
  background: white;
  border-radius: var(--radius-lg);
  border: 1.5px solid var(--color-neutral-200);
  border-left-width: 4px;
  padding: var(--space-5);
  box-shadow: var(--shadow-sm);
  animation: resultCardIn var(--duration-slow) var(--ease-out);
  transition: box-shadow var(--duration-normal);
}
.interaction-card:hover { box-shadow: var(--shadow-md); }

.interaction-card--safe      { border-left-color: var(--risk-safe-border); }
.interaction-card--caution   { border-left-color: var(--risk-caution-border); }
.interaction-card--danger    { border-left-color: var(--risk-danger-border); }
.interaction-card--forbidden { border-left-color: var(--risk-forbidden-border); }

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-3);
}
.card-drug-pair {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
  color: var(--color-neutral-800);
}
.pair-arrow { color: var(--color-neutral-400); }

.card-description {
  font-size: var(--text-sm);
  color: var(--color-neutral-600);
  line-height: var(--leading-relaxed);
  margin: 0;
}

.card-footer {
  display: flex;
  align-items: center;
  gap: var(--space-4);
  margin-top: var(--space-4);
  padding-top: var(--space-3);
  border-top: 1px solid var(--color-neutral-100);
}
.card-source-link {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--color-brand-600);
  text-decoration: none;
  font-weight: var(--font-medium);
}
.card-source-link:hover { text-decoration: underline; }
.card-source-link:focus-visible {
  outline: 2px solid var(--color-brand-500);
  outline-offset: 2px;
  border-radius: 2px;
}
.fallback-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  font-size: var(--text-xs);
  color: var(--color-neutral-500);
  padding: var(--space-1) var(--space-2);
  background: var(--color-neutral-100);
  border-radius: var(--radius-full);
}
```

---

### 4-5. 오류 안내 (ErrorGuide) — 2종 완전 분리

#### 오입력 안내 (UserErrorGuide)

```html
<div class="error-guide error-guide--user" role="alert" aria-live="polite">
  <div class="error-guide-icon" aria-hidden="true">
    <!-- TriangleAlert 24px -->
  </div>
  <div class="error-guide-content">
    <p class="error-guide-title">검색어를 확인해주세요</p>
    <p class="error-guide-desc">
      '<strong>[입력값]</strong>'에 해당하는 약을 찾지 못했습니다.
      한글·영문 약 이름 또는 성분명으로 검색하세요.
    </p>
    <div class="error-guide-examples">
      <span class="example-label">검색 예시</span>
      <button class="example-chip" type="button">타이레놀</button>
      <button class="example-chip" type="button">아스피린</button>
      <button class="example-chip" type="button">아세트아미노펜</button>
    </div>
  </div>
</div>
```

#### 시스템 오류 안내 (SysErrorGuide)

```html
<div class="error-guide error-guide--system" role="alert" aria-live="assertive">
  <div class="error-guide-icon" aria-hidden="true">
    <!-- ServerCrash 32px -->
  </div>
  <div class="error-guide-content">
    <p class="error-guide-title">서비스 오류가 발생했습니다</p>
    <p class="error-guide-desc">
      잠시 후 다시 시도해주세요. 문제가 지속되면 관리자에게 문의하세요.
    </p>
    <div class="error-guide-actions">
      <button class="btn btn--primary" type="button">
        <!-- RefreshCw 16px aria-hidden="true" -->
        다시 시도
      </button>
      <button class="btn btn--ghost" type="button">홈으로</button>
    </div>
    <p class="error-guide-note">입력하신 약 목록은 유지됩니다.</p>
  </div>
</div>
```

```css
.error-guide {
  display: flex;
  align-items: flex-start;
  gap: var(--space-4);
  padding: var(--space-5);
  border-radius: var(--radius-lg);
  border: 1.5px solid;
  margin-top: var(--space-4);
}

.error-guide--user {
  background: var(--color-user-error-bg);
  border-color: var(--color-user-error-icon);
}
.error-guide--user .error-guide-icon  { color: var(--color-user-error-icon); }
.error-guide--user .error-guide-title { color: var(--color-user-error-text); }

.error-guide--system {
  background: var(--color-sys-error-bg);
  border-color: var(--color-sys-error-icon);
  animation: errorPulse 1.5s ease-in-out 3;
}
.error-guide--system .error-guide-icon  { color: var(--color-sys-error-icon); }
.error-guide--system .error-guide-title { color: var(--color-sys-error-text); }

.error-guide-title {
  font-size: var(--text-base);
  font-weight: var(--font-semibold);
  margin: 0 0 var(--space-2);
}
.error-guide-desc {
  font-size: var(--text-sm);
  color: var(--color-neutral-600);
  margin: 0;
  line-height: var(--leading-relaxed);
}
.error-guide-examples {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  margin-top: var(--space-3);
  flex-wrap: wrap;
}
.example-label {
  font-size: var(--text-xs);
  color: var(--color-neutral-500);
}
.example-chip {
  padding: var(--space-1) var(--space-3);
  background: white;
  border: 1px solid var(--color-neutral-300);
  border-radius: var(--radius-full);
  font-size: var(--text-xs);
  color: var(--color-neutral-700);
  cursor: pointer;
  transition: background var(--duration-fast), border-color var(--duration-fast);
}
.example-chip:hover {
  background: var(--color-brand-50);
  border-color: var(--color-brand-500);
  color: var(--color-brand-700);
}

.error-guide-actions {
  display: flex;
  gap: var(--space-3);
  margin-top: var(--space-4);
}
.error-guide-note {
  font-size: var(--text-xs);
  color: var(--color-neutral-500);
  margin-top: var(--space-2);
  margin-bottom: 0;
}

/* 공통 버튼 */
.btn {
  display: inline-flex;
  align-items: center;
  gap: var(--space-2);
  height: 40px;
  padding: 0 var(--space-5);
  border-radius: var(--radius-md);
  font-size: var(--text-sm);
  font-weight: var(--font-semibold);
  cursor: pointer;
  border: none;
  transition: background var(--duration-fast), color var(--duration-fast);
}
.btn--primary {
  background: var(--color-brand-600);
  color: white;
}
.btn--primary:hover { background: var(--color-brand-700); }
.btn--ghost {
  background: transparent;
  color: var(--color-neutral-600);
  border: 1px solid var(--color-neutral-300);
}
.btn--ghost:hover { background: var(--color-neutral-100); }
```

---

## 5. 접근성 기준

### 5-1. 위험도 4등급 색맹 시뮬레이터 통과 명세

색각 이상 종류(적록·청황·전색맹) 모두에서 아이콘 형태와 텍스트로 구분 가능해야 합니다.

| 위험도 | 아이콘 | 형태 설명 | 텍스트 | 그레이스케일 L* | 구분 수단 |
|--------|--------|----------|--------|----------------|-----------|
| L1 안전 | `CheckCircle2` | 원+체크마크 (채움) | "안전" | L*≈88 (밝음) | 형태+텍스트 |
| L2 주의 | `AlertTriangle` | 삼각형+느낌표 | "주의" | L*≈78 | 형태+텍스트 |
| L3 위험 | `OctagonAlert` | 팔각형+느낌표 | "위험" | L*≈66 | 형태+텍스트 |
| L4 금기 | `Ban` | 원+사선 (통행금지) | "금기" | L*≈53 (어두움) | 형태+텍스트 |

**검증 도구**: Chrome DevTools > Rendering > Emulate vision deficiencies (4가지 시뮬레이션 전체 통과 필수)  
**합격 기준**: 4등급을 형태+텍스트만으로 구분 가능할 것 (색 제거 후에도)

---

### 5-2. WCAG 2.1 AA 기준 체크리스트

| 기준 | 최솟값 | 구현 방법 |
|------|-------|----------|
| 텍스트 색 대비 | 4.5:1 이상 | 모든 토큰 색 조합 충족 |
| 대형 텍스트 색 대비 (18px↑) | 3:1 이상 | 히어로·배지 대형 텍스트 충족 |
| 포커스 표시 | 2px outline + 3:1 대비 | `outline: 2px solid var(--color-brand-500); outline-offset: 2px` |
| 키보드 접근성 | 모든 인터랙티브 요소 | Tab 순서 §5-4 명세 준수 |
| 스크린 리더 | NVDA / VoiceOver | `aria-*` 속성 §4 명세 전체 구현 |
| 오류 식별 | 텍스트로 원인 명시 | §3 상태 정의표 메시지 그대로 사용 |
| 리플로우 | 320px 가로 스크롤 없음 | 검색바 max-width:100%, 칩 flex-wrap |
| 이미지 대체 텍스트 | 아이콘마다 | `aria-hidden="true"` + `.sr-only` 텍스트 |
| 모션 감소 존중 | prefers-reduced-motion | 전역 CSS 아래 코드 필수 적용 |
| 세션 타임아웃 경고 | 만료 20초 전 | toast + 연장 버튼 |

```css
/* prefers-reduced-motion 전역 (반드시 포함) */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration:       0.01ms !important;
    animation-iteration-count: 1     !important;
    transition-duration:      0.01ms !important;
  }
}
```

---

### 5-3. aria-live 영역 3곳 명세

```html
<!-- 1. 검색 결과 건수 알림 (polite) -->
<div aria-live="polite" aria-atomic="true" class="sr-only" id="search-status">
  <!-- JS 동적: "타이레놀 검색 결과 3건" / "검색 결과가 없습니다" -->
</div>

<!-- 2. 분석 완료·오류 알림 (polite) -->
<div aria-live="polite" aria-atomic="true" class="sr-only" id="analysis-status">
  <!-- JS 동적: "분석 완료. 금기 1건, 주의 1건 발견" / "분석 중..." -->
</div>

<!-- 3. 시스템 오류 즉시 알림 (assertive) -->
<div aria-live="assertive" aria-atomic="true" class="sr-only" id="system-alert">
  <!-- JS 동적: "서비스 오류가 발생했습니다. 다시 시도해주세요." -->
</div>
```

---

### 5-4. 키보드 인터랙션 명세

| 요소 | 키 | 동작 |
|------|---|------|
| 검색 입력창 | `Enter` | 검색 실행 |
| 검색 입력창 | `↓` | 드롭다운 첫 항목 포커스 |
| 드롭다운 항목 | `↑` `↓` | 항목 탐색 |
| 드롭다운 항목 | `Enter` | 선택 + 약 추가 |
| 드롭다운 항목 | `Esc` | 드롭다운 닫기, 입력창 복귀 |
| 약 칩 | `Delete` / `Backspace` | 칩 제거 |
| 칩 제거 버튼 | `Enter` / `Space` | 칩 제거 |
| 분석 버튼 | `Enter` / `Space` | 분석 실행 |
| [다시 시도] | `Enter` | 재시도 |
| [홈으로] | `Enter` | 홈 이동 |

`.sr-only` 클래스 정의 (전역):
```css
.sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

---

## 6. 반응형 레이아웃

```css
--bp-sm:  640px;
--bp-md:  768px;
--bp-lg:  1024px;
--bp-xl:  1280px;

.container {
  width: 100%;
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 var(--space-4);
}
@media (min-width: 640px)  { .container { padding: 0 var(--space-6); } }
@media (min-width: 1024px) { .container { padding: 0 var(--space-8); } }

/* 약 칩 목록 */
.chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-2);
}

/* 결과 카드: 768px↑ 2열 */
@media (min-width: 768px) {
  .result-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--space-4);
  }
}

/* 검색바: 320px~640px 전폭 */
@media (max-width: 640px) {
  .search-bar    { max-width: 100%; }
  .search-submit { padding: 0 var(--space-3); font-size: var(--text-xs); }
}
```

---

## 7. 의료 면책 고지 설계

**표시 위치**: 결과 화면 하단 + 전 화면 footer  
**폰트**: `--text-xs`, `--color-neutral-400`  
**문구**: "본 서비스는 식약처 공공데이터를 기반으로 하며 의사·약사의 의료 조언을 대체하지 않습니다."

L3·L4 결과 시 결과 카드 상단에 경고 배너 자동 삽입:
```html
<div class="medical-warning" role="note" aria-label="의료 주의사항">
  <!-- Info 16px aria-hidden="true" -->
  <p>이 결과는 참고용입니다. 의사·약사와 반드시 상담하세요.</p>
</div>
```

```css
.medical-warning {
  display: flex;
  align-items: flex-start;
  gap: var(--space-3);
  padding: var(--space-3) var(--space-4);
  background: var(--color-info-bg);
  border: 1px solid var(--color-info-icon);
  border-radius: var(--radius-md);
  color: var(--color-info-text);
  font-size: var(--text-sm);
  margin-bottom: var(--space-4);
}
```

---

## 8. 30초 완주 플로우 검증

의료 비전문 사용자가 **도움말 없이 30초 내** 결과 도달하는 시나리오:

| 단계 | 사용자 행동 | UI 응답 | 누적 시간 |
|------|------------|---------|----------|
| 1 | 페이지 진입 | 검색바 자동 포커스 | 0s |
| 2 | "타이레놀" 타이핑 | 드롭다운 즉시 표시 (P95 ≤150ms) | ~3s |
| 3 | 드롭다운 클릭 | 칩 추가 + 검색바 초기화 | ~5s |
| 4 | "아스피린" 타이핑 + 선택 | 두 번째 칩 추가 | ~10s |
| 5 | [상호작용 분석하기] 클릭 | 로딩 → 결과 (P95 ≤200ms) | ~12s |
| 6 | 종합 판정 배지 확인 | "⊗ 금기" 즉시 인지 | ~14s |
| 7 | 상세 카드 읽기 | 결과 2건 표시 | ~25s |

**목표 달성**: 15~25초 (30초 이내 충족)

---

## 9. 프론트엔드 구현 체크리스트

- [ ] `§1` CSS 변수 전체 `:root { }` 선언
- [ ] `@keyframes` 전체 선언 (spin, fadeIn, chipIn, chipOut, shake, resultCardIn, errorPulse)
- [ ] `@media (prefers-reduced-motion: reduce)` 전역 적용
- [ ] 검색바: autofocus, ARIA 속성 전체, 드롭다운 키보드 탐색 (↑↓ Enter Esc)
- [ ] 검색 상태 7종 (`data-state` 속성 + 조건부 아이콘 전환)
- [ ] 약 칩: chipIn 애니메이션, Delete/Backspace 키 제거, chipOut 후 DOM 제거
- [ ] 위험도 배지: 4등급 × 3중 표현 (색+아이콘+텍스트) 모두 구현
- [ ] 위험도 배지: 대형 variant (종합 판정용)
- [ ] 결과 카드: 왼쪽 4px 강조 바, 식약처 링크, ML 폴백 배지
- [ ] 오류 안내: 오입력(오렌지+삼각) ↔ 시스템 오류(레드+서버) 완전 분리
- [ ] aria-live 영역 3곳 (search-status, analysis-status, system-alert)
- [ ] `.sr-only` 클래스 전역 선언
- [ ] 그레이스케일 시뮬레이션 4등급 구분 통과 확인
- [ ] L3·L4 결과 시 medical-warning 배너 자동 삽입
- [ ] 모바일 320px·375px 레이아웃 검증 (가로 스크롤 없음)
- [ ] 약 11개 이상 추가 차단 + toast 표시
- [ ] 면책 고지 footer 전 화면 표시

---

*Design Spec v1.0 — 약체크 YakCheck*  
*담당: 디자이너 Organt | 기준일: 2026-06-13*  
*식약처 공공데이터 기반 · WCAG 2.1 AA · 색맹 4종 시뮬레이터 통과 설계*
