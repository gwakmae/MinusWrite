window.MinusBook = window.MinusBook || {};

/* ======================================================
   일별 복구 뷰

   - 앱을 열면 오늘 날짜로 바로 뜬다
   - 입력은 "오늘의 복구"와 "리베이트" 두 칸 — 둘 다
     직접 적는다 (리베이트는 자동 계산하지 않는다)
   - 입력하는 즉시 오늘 복구 금액(복구+리베이트)과
     리베이트 제외/포함 두 가지 남은 손실이 계산된다
   - 모든 주요 금액 아래에 실시간 환율로 환산한
     원화 금액이 함께 표시된다
   ====================================================== */

MinusBook.DayView = (() => {
    const Calc = MinusBook.Calc;
    const Data = MinusBook.Data;

    /* 현재 보고 있는 날짜 (Date 객체) */
    let currentDate = new Date();

    function setDate(date) {
        currentDate = date;
    }

    function getDate() {
        return currentDate;
    }

    function moveDay(offset) {
        const d = new Date(currentDate);

        d.setDate(d.getDate() + offset);

        currentDate = d;
    }

    function isToday() {
        return Calc.dateKey(currentDate) ===
            Calc.dateKey(new Date());
    }

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
       렌더링
       ================================================== */

    function render(container) {
        const key = Calc.dateKey(currentDate);
        const entry = Data.getEntry(key);
        const hasEntry = Boolean(entry);

        const weekday = Calc.weekdayName(currentDate);
        const dayOfWeek = currentDate.getDay();
        const weekdayClass =
            dayOfWeek === 0 ? "sun" : dayOfWeek === 6 ? "sat" : "";

        container.innerHTML =
            '<section class="panel">' +
                '<div class="day-header">' +
                    '<button type="button" class="day-nav-btn" ' +
                        'id="prev-day" aria-label="전날">◀</button>' +

                    '<div class="day-title">' +
                        '<span class="date">' +
                            (currentDate.getMonth() + 1) + "월 " +
                            currentDate.getDate() + "일" +
                        '</span>' +
                        '<span class="weekday ' + weekdayClass + '">' +
                            weekday + "요일" +
                        '</span>' +
                        (isToday()
                            ? '<span class="today-pill">오늘</span>'
                            : "") +
                    '</div>' +

                    '<button type="button" class="day-nav-btn" ' +
                        'id="next-day" aria-label="다음날">▶</button>' +
                '</div>' +

                '<div class="field">' +
                    '<label for="f-recover">오늘의 복구 (USD)</label>' +
                    '<div class="money-input-wrap">' +
                        '<input id="f-recover" type="number" ' +
                            'inputmode="decimal" step="0.01" min="0" ' +
                            'placeholder="0.00" ' +
                            'value="' + fieldOrEmpty(entry, "recover") + '">' +
                        '<span class="won">$</span>' +
                    '</div>' +
                '</div>' +

                '<div class="field">' +
                    '<label for="f-rebate">리베이트 (USD, 직접 입력)</label>' +
                    '<div class="money-input-wrap">' +
                        '<input id="f-rebate" type="number" ' +
                            'inputmode="decimal" step="0.01" min="0" ' +
                            'placeholder="0.00" ' +
                            'value="' + fieldOrEmpty(entry, "rebate") + '">' +
                        '<span class="won">$</span>' +
                    '</div>' +
                '</div>' +

                /* 입력 직후 바로 저장할 수 있도록 여기에 둔다 */
                '<div class="button-row form-actions">' +
                    '<button type="button" class="action-button" ' +
                        'id="save-entry">저장</button>' +
                '</div>' +

                '<div class="field">' +
                    '<label for="f-note">메모 (선택)</label>' +
                    '<div class="money-input-wrap">' +
                        '<input id="f-note" type="text" ' +
                            'class="text-input" ' +
                            'placeholder="예: 나스닥 선물 scalping 복구분" ' +
                            'value="' +
                                (entry && entry.note ? entry.note : "") +
                            '">' +
                    '</div>' +
                '</div>' +

                '<div class="calc-preview" id="calc-preview"></div>' +

                (hasEntry
                    ? '<div class="button-row">' +
                      '<button type="button" ' +
                          'class="action-button danger" ' +
                          'id="delete-entry">이 날 기록 삭제</button>' +
                      '</div>'
                    : "") +
            '</section>' +

            /* 전체 복구 현황 (리베이트 제외 / 포함 기준) */
            MinusBook.App.statusHtml();

        bindEvents(container);
        refreshCalc(container);
    }

    function fieldOrEmpty(entry, field) {
        if (!entry || !entry[field]) {
            return "";
        }

        return entry[field];
    }

    /* ==================================================
       폼 읽기 / 실시간 계산
       ================================================== */

    function readForm(container) {
        return {
            recover: container.querySelector("#f-recover").value,
            rebate: container.querySelector("#f-rebate").value,
            note: container.querySelector("#f-note").value
        };
    }

    function refreshCalc(container) {
        const key = Calc.dateKey(currentDate);
        const form = readForm(container);
        const loss = Data.getLossAmount();

        const result = Calc.day(form);

        /* 이 날 "직전까지"의 누계 (이 날 저장값은 빼고 계산) */
        const entries = Object.assign({}, Data.getState().entries);

        delete entries[key];

        const base = Calc.totals(entries, key);

        /* 폼 값까지 반영한 이 날 기준 남은 손실 */
        const pureRemaining =
            loss - (base.recover + result.recover);
        const remaining =
            loss - (base.total + result.total);

        container.querySelector("#calc-preview").innerHTML =
            '<div class="calc-row">' +
                '<span>오늘의 복구</span>' +
                '<span class="value">' +
                    Calc.usd(result.recover) +
                '</span>' +
            '</div>' +
            '<div class="calc-row rebate">' +
                '<span>리베이트</span>' +
                '<span class="value">+' +
                    Calc.usd(result.rebate) +
                '</span>' +
            '</div>' +
            '<div class="calc-row applied">' +
                '<span>오늘 복구 금액 (복구 + 리베이트)</span>' +
                '<span class="value">' +
                    Calc.usd(result.total) +
                    krwSub(result.total) +
                '</span>' +
            '</div>' +
            '<div class="calc-row balance">' +
                '<span>남은 손실 (리베이트 제외)</span>' +
                '<span class="value ' +
                    Calc.remainingClass(pureRemaining) + '">' +
                    Calc.remainingText(pureRemaining) +
                '</span>' +
            '</div>' +
            '<div class="calc-row net balance">' +
                '<span>남은 손실 (리베이트 포함)</span>' +
                '<span class="value ' +
                    Calc.remainingClass(remaining) + '">' +
                    Calc.remainingText(remaining) +
                    krwSub(remaining) +
                '</span>' +
            '</div>';
    }

    function isFormEmpty(container) {
        const form = readForm(container);

        return !form.recover && !form.rebate && !form.note.trim();
    }

    /* ==================================================
       이벤트
       ================================================== */

    function bindEvents(container) {
        /* 터치 한 번으로 전체 선택 → 바로 새 값 입력 */
        container
            .querySelectorAll('input[type="number"]')
            .forEach(el => {
                const selectAll = () => {
                    el.select();
                };

                el.addEventListener("focus", selectAll);
                el.addEventListener("click", selectAll);

                el.addEventListener("input", () => {
                    refreshCalc(container);
                });
            });

        container
            .querySelector("#f-note")
            .addEventListener("input", () => {
                refreshCalc(container);
            });

        container
            .querySelector("#prev-day")
            .addEventListener("click", () => {
                moveDay(-1);
                render(container);
            });

        container
            .querySelector("#next-day")
            .addEventListener("click", () => {
                moveDay(1);
                render(container);
            });

        container
            .querySelector("#save-entry")
            .addEventListener("click", async () => {
                const key = Calc.dateKey(currentDate);
                const button = container.querySelector("#save-entry");

                if (isFormEmpty(container)) {
                    MinusBook.App.showToast(
                        "입력된 내용이 없습니다."
                    );
                    return;
                }

                button.disabled = true;
                button.textContent = "저장 중...";

                const result = await Data.saveEntry(
                    key,
                    readForm(container)
                );

                MinusBook.App.afterSync(result);

                render(container);
            });

        const deleteButton = container.querySelector("#delete-entry");

        if (deleteButton) {
            deleteButton.addEventListener("click", async () => {
                const label =
                    (currentDate.getMonth() + 1) + "월 " +
                    currentDate.getDate() + "일";

                const ok = window.confirm(
                    label + " 기록을 삭제할까요?"
                );

                if (!ok) {
                    return;
                }

                const key = Calc.dateKey(currentDate);

                const result = await Data.saveEntry(key, null);

                MinusBook.App.afterSync(result);

                render(container);
            });
        }
    }

    return Object.freeze({ render, setDate, getDate });
})();