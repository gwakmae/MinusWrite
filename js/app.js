window.MinusBook = window.MinusBook || {};

MinusBook.App = (() => {
    const Calc = MinusBook.Calc;
    const Data = MinusBook.Data;

    /* ==================================================
       토스트
       ================================================== */

    function showToast(message) {
        const container = document.getElementById("toast-container");
        const toast = document.createElement("div");

        toast.className = "toast";
        toast.textContent = message;

        container.appendChild(toast);

        window.setTimeout(() => {
            toast.remove();
        }, 3000);
    }

    /* ==================================================
       동기화 상태 배지
       ================================================== */

    function renderSyncBadge() {
        const badge = document.getElementById("sync-badge");

        badge.classList.remove("ok", "pending", "error");

        /* github.io가 아니면 로컬 테스트 — 동기화 대상 없음 */
        if (!location.hostname.endsWith(".github.io")) {
            badge.textContent = "로컬 테스트";
            return;
        }

        const syncState = Data.getSyncState();

        if (syncState === "ok") {
            badge.classList.add("ok");
            badge.textContent = "☁ 동기화됨";
        } else if (syncState === "pending") {
            badge.classList.add("pending");
            badge.textContent = "● 이 기기에만 저장";
        } else {
            badge.classList.add("error");
            badge.textContent = "⚠ 동기화 실패";
        }
    }

    /* 저장 후 공통 처리 */
    function afterSync(result) {
        renderSyncBadge();

        if (result.ok && !result.skipped) {
            showToast("저장했습니다. 다른 기기에도 곧 반영됩니다.");
        } else if (result.ok) {
            showToast("저장했습니다.");
        } else {
            showToast(
                "이 기기에만 저장됐습니다. (" + result.reason + ")"
            );
        }
    }

    /* ==================================================
       헤더 부제
       ================================================== */

    function renderHeader() {
        const now = new Date();

        document.getElementById("header-month").textContent =
            now.getFullYear() + "년 " + (now.getMonth() + 1) + "월 " +
            now.getDate() + "일 " + Calc.weekdayName(now) + "요일";
    }

    /* ==================================================
       전체 복구 현황 패널 (일별/월별 뷰가 공통 사용)

       리베이트 제외(순수 복구)와 리베이트 포함(실제 복구)을
       나란히 보여준다.
       ================================================== */

    function statusHtml() {
        const state = Data.getState();
        const loss = Data.getLossAmount();

        const t = Calc.totals(state.entries, null);

        const pct =
            Math.round(Calc.progress(loss, t.total) * 1000) / 10;
        const purePct =
            Math.round(Calc.progress(loss, t.recover) * 1000) / 10;

        const remaining = loss - t.total;
        const pureRemaining = loss - t.recover;

        const rateText = MinusBook.Rate.fmtRate();

        const rateRow = rateText
            ? statusRow("오늘 환율", rateText, "")
            : "";

        return (
            '<section class="panel">' +
                '<h2 class="panel-title">손실 복구 현황</h2>' +

                '<div class="status-group">' +
                    '<div class="status-group-title">' +
                        "📈 순수 복구 (리베이트 제외)" +
                    '</div>' +
                    statusRow(
                        "순수 복구 누계",
                        Calc.usd(t.recover),
                        ""
                    ) +
                    statusRow(
                        "남은 손실",
                        Calc.remainingText(pureRemaining) +
                            krwSub(pureRemaining),
                        Calc.remainingClass(pureRemaining)
                    ) +
                    statusRow(
                        "복구율",
                        purePct + "%",
                        ""
                    ) +
                '</div>' +

                '<div class="status-group">' +
                    '<div class="status-group-title">' +
                        "✨ 리베이트 포함 (실제 복구 효과)" +
                    '</div>' +
                    statusRow(
                        "리베이트 누계",
                        "+" + Calc.usd(t.rebate),
                        "rebate"
                    ) +
                    statusRow(
                        "실제 전체 복구액",
                        Calc.usd(t.total),
                        ""
                    ) +
                    statusRow(
                        "실제 남은 손실",
                        Calc.remainingText(remaining) +
                            krwSub(remaining),
                        Calc.remainingClass(remaining)
                    ) +
                '</div>' +

                '<div class="status-group">' +
                    rateRow +
                '</div>' +

                '<div class="progress-track">' +
                    '<div class="progress-fill" style="width:' +
                        pct + '%"></div>' +
                '</div>' +
                '<div class="progress-label">' +
                    '<span>복구율 ' + pct + '%</span>' +
                    '<span>손실금액 ' +
                        Calc.usd(loss) +
                        (rateText
                            ? " (" + MinusBook.Rate.fmtKrw(loss) + ")"
                            : "") +
                    '</span>' +
                '</div>' +
            '</section>'
        );
    }

    /* 원화 환산 보조 줄 */
    function krwSub(usdAmount) {
        const text = MinusBook.Rate.fmtKrw(Math.abs(usdAmount));

        if (!text) {
            return "";
        }

        return '<span class="krw-sub">' + text + '</span>';
    }

    function statusRow(label, value, cls) {
        return (
            '<div class="status-row">' +
                '<span>' + label + '</span>' +
                '<span class="value ' + cls + '">' +
                    value +
                '</span>' +
            '</div>'
        );
    }

    /* ==================================================
       뷰 전환
       ================================================== */

    function showView(viewName) {
        document
            .querySelectorAll(".nav-button")
            .forEach(button => {
                button.classList.toggle(
                    "active",
                    button.dataset.view === viewName
                );
            });

        const main = document.getElementById("main-view");

        if (viewName === "day") {
            MinusBook.DayView.render(main);
        } else if (viewName === "month") {
            MinusBook.MonthView.render(main);
        } else if (viewName === "scenario") {
            MinusBook.ScenarioView.render(main);
        } else if (viewName === "settings") {
            renderSettings(main);
        }

        window.scrollTo(0, 0);
    }

    /* ==================================================
       설정 뷰
       ================================================== */

    function renderSettings(container) {
        const hasToken = Boolean(Data.getToken());
        const lossAmount = Data.getLossAmount();

        container.innerHTML =
            '<section class="panel">' +
                '<h2 class="panel-title">복구 프로젝트 설정</h2>' +
                '<div class="field settings-field">' +
                    '<label for="f-loss-amount">' +
                        "손실금액 (USD)" +
                    '</label>' +
                    '<input id="f-loss-amount" type="number" ' +
                        'inputmode="decimal" step="0.01" min="0" ' +
                        'value="' + lossAmount + '">' +
                    '<p class="field-hint">' +
                        "복구해야 할 총 트레이딩 손실금액을 달러로 입력하세요. " +
                        "예: $15,000 손실 → 15000" +
                    '</p>' +
                '</div>' +
                '<div class="button-row">' +
                    '<button type="button" class="action-button secondary" ' +
                        'id="save-settings">설정 저장</button>' +
                '</div>' +
            '</section>' +

            '<section class="panel">' +
                '<h2 class="panel-title">GitHub 동기화</h2>' +
                '<div class="field settings-field">' +
                    '<label for="f-gh-token">' +
                        "GitHub 토큰 (기기별 최초 1회)" +
                    '</label>' +
                    '<input id="f-gh-token" type="password" ' +
                        'value="' + (hasToken ? Data.getToken() : "") + '" ' +
                        'placeholder="토큰 붙여넣기">' +
                    '<p class="field-hint">' +
                        "토큰은 이 브라우저에만 저장됩니다. " +
                        "GitHub → Settings → Developer settings → " +
                        "Personal access tokens 에서 " +
                        "이 저장소의 contents 권한으로 발급하세요. " +
                        (hasToken
                            ? "현재 저장되어 있습니다."
                            : "아직 저장되지 않았습니다.") +
                    '</p>' +
                '</div>' +
                '<div class="button-row">' +
                    '<button type="button" class="action-button secondary" ' +
                        'id="save-token">토큰 저장</button>' +
                    '<button type="button" class="action-button" ' +
                        'id="sync-now">지금 동기화</button>' +
                '</div>' +
            '</section>' +

            '<section class="panel">' +
                '<h2 class="panel-title">데이터 백업</h2>' +
                '<p class="field-hint">' +
                    "현재 기록 전체를 JSON 파일로 내려받습니다. " +
                    "진짜 데이터는 GitHub 저장소의 " +
                    "data/recovery-entries.json 에 있습니다." +
                '</p>' +
                '<div class="button-row">' +
                    '<button type="button" class="action-button secondary" ' +
                        'id="download-json">recovery-entries.json 다운로드</button>' +
                '</div>' +
            '</section>';

        bindSettings(container);
    }

    function bindSettings(container) {
        /* 설정의 금액 칸도 터치 시 전체 선택 */
        container
            .querySelectorAll('input[type="number"]')
            .forEach(el => {
                const selectAll = () => {
                    el.select();
                };

                el.addEventListener("focus", selectAll);
                el.addEventListener("click", selectAll);
            });

        container
            .querySelector("#save-settings")
            .addEventListener("click", async () => {
                const amount = Number(
                    container.querySelector("#f-loss-amount").value
                );

                if (!Number.isFinite(amount) || amount < 0) {
                    showToast("손실금액을 확인해 주세요.");
                    return;
                }

                const result = await Data.saveSettings(amount);

                afterSync(result);
            });

        container
            .querySelector("#save-token")
            .addEventListener("click", () => {
                const value = container
                    .querySelector("#f-gh-token")
                    .value.trim();

                Data.setToken(value);

                showToast(
                    value
                        ? "토큰을 이 브라우저에 저장했습니다."
                        : "토큰을 삭제했습니다."
                );
            });

        container
            .querySelector("#sync-now")
            .addEventListener("click", async () => {
                const button = container.querySelector("#sync-now");

                button.disabled = true;
                button.textContent = "동기화 중...";

                const result = await Data.sync();

                afterSync(result);

                button.disabled = false;
                button.textContent = "지금 동기화";
            });

        container
            .querySelector("#download-json")
            .addEventListener("click", () => {
                const state = Data.getState();

                const blob = new Blob(
                    [JSON.stringify(state, null, 2)],
                    { type: "application/json;charset=utf-8" }
                );

                const link = document.createElement("a");

                link.href = URL.createObjectURL(blob);
                link.download = "recovery-entries.json";
                link.click();

                URL.revokeObjectURL(link.href);

                showToast("recovery-entries.json을 다운로드했습니다.");
            });
    }

    /* ==================================================
       초기화
       ================================================== */

    async function init() {
        renderHeader();
        renderSyncBadge();

        document
            .querySelectorAll(".nav-button")
            .forEach(button => {
                button.addEventListener("click", () => {
                    showView(button.dataset.view);
                });
            });

        const main = document.getElementById("main-view");

        main.innerHTML =
            '<div class="loading-state">' +
                "기록을 불러오는 중입니다..." +
            '</div>';

        await Promise.all([
            Data.load(),
            MinusBook.Rate.load()
        ]);

        renderSyncBadge();

        /* 첫 화면: 오늘 날짜 입력폼 */
        MinusBook.DayView.setDate(new Date());
        MinusBook.MonthView.setMonth(
            new Date().getFullYear(),
            new Date().getMonth()
        );

        showView("day");
    }

    document.addEventListener("DOMContentLoaded", init);

    return Object.freeze({ showView, showToast, afterSync, statusHtml });
})();