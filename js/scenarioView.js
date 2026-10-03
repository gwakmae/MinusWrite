window.MinusBook = window.MinusBook || {};

/* ======================================================
   복구 시나리오 뷰 (독립 탭)

   - 남은 손실 근처에서 약수가 많은 정수 목표를 잡아
     "매일 $X × N일" 조합을 전부 보여준다
   - 🔄 다른 목표 버튼으로 후보를 순환한다
   - 상단에 전체 복구 현황 패널을 함께 보여줘서
     남은 손실을 확인하며 목표를 고를 수 있다
   ====================================================== */

MinusBook.ScenarioView = (() => {
    const Calc = MinusBook.Calc;
    const Data = MinusBook.Data;

    /* 목표 후보 인덱스 (다른 목표 버튼으로 순환) */
    let targetIndex = 0;

    /* ==================================================
       원화 보조 표시
       ================================================== */

    function krwSub(usdAmount) {
        const text = MinusBook.Rate.fmtKrw(Math.abs(usdAmount));

        if (!text) {
            return "";
        }

        return '<span class="krw-sub">' + text + '</span>';
    }

    /* ==================================================
       시나리오 패널
       ================================================== */

    function scenarioPanel() {
        const state = Data.getState();
        const loss = Data.getLossAmount();
        const t = Calc.totals(state.entries, null);
        const remaining = loss - t.total;

        if (remaining <= 0) {
            return (
                '<section class="panel" id="scenario-panel">' +
                    '<h2 class="panel-title">🎯 복구 시나리오</h2>' +
                    '<p class="field-hint">' +
                        "손실을 전부 복구했습니다. 🎉" +
                    '</p>' +
                '</section>'
            );
        }

        /* 후보 목록: 첫 번째는 반올림한 실제 손실,
           나머지는 근처에서 약수가 많은 정수들 */
        const targets = Calc.scenarioTargets(remaining);

        targetIndex = targetIndex % targets.length;

        const target = targets[targetIndex];
        const plans = Calc.scenarioPlans(target);
        const diff = remaining - target;

        let hint;

        if (Math.abs(diff) < 0.005) {
            hint =
                "남은 손실 " + Calc.usd(remaining) +
                "의 약수 조합 전부입니다. " +
                "하루 목표가 정확히 정수로 떨어집니다.";
        } else {
            hint =
                "실제 남은 손실 " + Calc.usd(remaining) +
                "을(를) 약수가 많은 목표 " + Calc.usd(target) +
                "로 맞췄습니다 (차이 " +
                (diff > 0 ? "+" : "-") +
                Calc.usd(Math.abs(diff)) +
                "). 마지막 날에 차이만큼 조정하면 " +
                "정확히 복구됩니다.";
        }

        let cards = "";

        plans.forEach(item => {
            const done = new Date();

            done.setDate(done.getDate() + item.days);

            cards +=
                '<div class="scenario-card">' +
                    '<span class="daily">' +
                        "매일 " + Calc.usd(item.daily) +
                        krwSub(item.daily) +
                    '</span>' +
                    '<span class="days">× ' + item.days + "일</span>" +
                    '<span class="done-date">' +
                        "완료 예정 " +
                        (done.getMonth() + 1) + "/" + done.getDate() +
                    '</span>' +
                '</div>';
        });

        return (
            '<section class="panel" id="scenario-panel">' +
                '<div class="scenario-head">' +
                    '<h2 class="panel-title">🎯 복구 시나리오</h2>' +
                    '<button type="button" class="scenario-refresh" ' +
                        'id="refresh-scenario">🔄 다른 목표</button>' +
                '</div>' +
                '<div class="scenario-badge">' +
                    "목표 " + Calc.usd(target) +
                    " · 조합 " + plans.length + "개" +
                    " · 후보 " + (targetIndex + 1) + "/" +
                    targets.length +
                '</div>' +
                '<p class="field-hint">' + hint + '</p>' +
                '<div class="scenario-list">' + cards + '</div>' +
            '</section>'
        );
    }

    /* ==================================================
       렌더링 / 이벤트
       ================================================== */

    function render(container) {
        container.innerHTML =
            /* 전체 복구 현황 — 남은 손실을 보며 목표를 고른다 */
            MinusBook.App.statusHtml() +

            scenarioPanel();

        bindScenario(container);
    }

    function bindScenario(container) {
        const button = container.querySelector("#refresh-scenario");

        if (!button) {
            return;
        }

        button.addEventListener("click", () => {
            targetIndex += 1;

            const old = container.querySelector("#scenario-panel");
            const tmp = document.createElement("div");

            tmp.innerHTML = scenarioPanel();

            old.replaceWith(tmp.firstElementChild);

            bindScenario(container);
        });
    }

    return Object.freeze({ render });
})();