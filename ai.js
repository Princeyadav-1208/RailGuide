/* ==========================================
      RailGuide AI Assistant (floating chat)
      index.html me script.js ke baad ye line honi chahiye:
      <script src="ai.js"></script>
========================================== */

(function () {
    // Local (Live Server / file) par laptop wala Flask, live site par Render wala backend
    const isLocal = ["localhost", "127.0.0.1", ""].includes(location.hostname);
    const AI_API =
        (isLocal
            ? "http://127.0.0.1:5000"
            : (typeof API_BASE_URL !== "undefined" ? API_BASE_URL : "")) + "/ai/chat";

    const history = [];
    let busy = false;

    /* ---------- Styles (isolated with rgai- prefix) ---------- */
    const css = `
    .rgai-fab{position:fixed;right:20px;bottom:20px;width:60px;height:60px;border-radius:50%;
        border:none;background:#1565c0;color:#fff;font-size:26px;cursor:pointer;z-index:10000;
        box-shadow:0 6px 20px rgba(13,71,161,.4);transition:transform .2s}
    .rgai-fab:hover{transform:scale(1.06)}
    .rgai-panel{position:fixed;right:20px;bottom:92px;width:min(390px,calc(100vw - 24px));
        height:min(560px,calc(100vh - 120px));background:#fff;border-radius:18px;z-index:10000;
        box-shadow:0 12px 40px rgba(0,0,0,.25);display:none;flex-direction:column;overflow:hidden}
    .rgai-panel.open{display:flex}
    .rgai-head{background:linear-gradient(135deg,#0d47a1,#1e88e5);color:#fff;padding:14px 16px;
        display:flex;align-items:center;justify-content:space-between}
    .rgai-head b{font-size:16px}
    .rgai-head small{display:block;opacity:.85;font-size:12px;margin-top:2px}
    .rgai-close{background:none;border:none;color:#fff;font-size:22px;cursor:pointer}
    .rgai-msgs{flex:1;overflow-y:auto;padding:14px;background:#f4f6f9;display:flex;flex-direction:column;gap:10px}
    .rgai-msg{max-width:86%;padding:10px 13px;border-radius:14px;font-size:14.5px;line-height:1.5;word-wrap:break-word}
    .rgai-msg.user{align-self:flex-end;background:#1565c0;color:#fff;border-bottom-right-radius:4px}
    .rgai-msg.bot{align-self:flex-start;background:#fff;color:#222;border-bottom-left-radius:4px;
        box-shadow:0 1px 4px rgba(0,0,0,.08)}
    .rgai-msg.err{align-self:flex-start;background:#ffebee;color:#c62828;font-weight:600}
    .rgai-chips{display:flex;flex-wrap:wrap;gap:8px}
    .rgai-chip{background:#e3f2fd;color:#0d47a1;border:none;border-radius:16px;padding:7px 12px;
        font-size:13px;cursor:pointer;font-weight:600}
    .rgai-chip:hover{background:#bbdefb}
    .rgai-form{display:flex;gap:8px;padding:10px;border-top:1px solid #e5e7eb;background:#fff}
    .rgai-form input{flex:1;padding:11px 14px;border:1px solid #ccc;border-radius:22px;font-size:14.5px;outline:none}
    .rgai-form input:focus{border-color:#1976d2;box-shadow:0 0 0 3px rgba(25,118,210,.15)}
    .rgai-form button{width:44px;height:44px;border-radius:50%;border:none;background:#1565c0;color:#fff;
        cursor:pointer;font-size:16px}
    .rgai-form button:disabled{opacity:.5;cursor:not-allowed}
    .rgai-typing{display:inline-flex;gap:4px}
    .rgai-typing i{width:7px;height:7px;border-radius:50%;background:#90a4ae;animation:rgaiBlink 1s infinite}
    .rgai-typing i:nth-child(2){animation-delay:.15s}
    .rgai-typing i:nth-child(3){animation-delay:.3s}
    @keyframes rgaiBlink{0%,80%,100%{opacity:.3}40%{opacity:1}}
    @media (prefers-reduced-motion:reduce){.rgai-typing i{animation:none}}
    `;

    const styleEl = document.createElement("style");
    styleEl.textContent = css;
    document.head.appendChild(styleEl);

    /* ---------- Markup ---------- */
    const fab = document.createElement("button");
    fab.className = "rgai-fab";
    fab.setAttribute("aria-label", "Open RailGuide AI chat");
    fab.innerHTML = '<i class="fa-solid fa-robot"></i>';

    const panel = document.createElement("div");
    panel.className = "rgai-panel";
    panel.innerHTML = `
        <div class="rgai-head">
            <div><b>RailGuide AI</b><small>Live status, trains aur station guide</small></div>
            <button class="rgai-close" aria-label="Close chat">&times;</button>
        </div>
        <div class="rgai-msgs" id="rgai-msgs"></div>
        <form class="rgai-form" id="rgai-form">
            <input id="rgai-input" type="text" maxlength="500" autocomplete="off"
                   placeholder="Kuch bhi poochho...">
            <button type="submit" id="rgai-send" aria-label="Send"><i class="fa-solid fa-paper-plane"></i></button>
        </form>`;

    document.body.appendChild(fab);
    document.body.appendChild(panel);

    const msgsEl = panel.querySelector("#rgai-msgs");
    const formEl = panel.querySelector("#rgai-form");
    const inputEl = panel.querySelector("#rgai-input");
    const sendEl = panel.querySelector("#rgai-send");

    /* ---------- Helpers ---------- */
    function escapeHtml(s) {
        return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    // Safe mini-markdown: **bold**, bullets, new lines
    function formatReply(text) {
        return escapeHtml(text)
            .replace(/\*\*(.+?)\*\*/g, "<b>$1</b>")
            .split("\n")
            .map((line) => line.replace(/^\s*[*-]\s+/, "• "))
            .join("<br>");
    }

    function addMsg(type, content, asHtml) {
        const el = document.createElement("div");
        el.className = "rgai-msg " + type;
        if (asHtml) el.innerHTML = content;
        else el.textContent = content;
        msgsEl.appendChild(el);
        msgsEl.scrollTop = msgsEl.scrollHeight;
        return el;
    }

    function showWelcome() {
        addMsg(
            "bot",
            "Namaste! Main train ka live status, do stations ke beech ki trains, kisi train ki detail, " +
                "aur kisi bhi station ke ghumne ki jagah aur famous khana bata sakta hoon."
        );
        const chips = document.createElement("div");
        chips.className = "rgai-chips";
        [
            "Jaipur station ke bare me batao",
            "Jaipur se Delhi ki trains",
            "12015 train ka live status",
        ].forEach((q) => {
            const b = document.createElement("button");
            b.type = "button";
            b.className = "rgai-chip";
            b.textContent = q;
            b.onclick = () => {
                chips.remove();
                send(q);
            };
            chips.appendChild(b);
        });
        msgsEl.appendChild(chips);
    }

    /* ---------- Send ---------- */
    async function send(text) {
        text = (text || "").trim();
        if (!text || busy) return;

        busy = true;
        sendEl.disabled = true;
        inputEl.value = "";
        addMsg("user", text);

        const typing = addMsg(
            "bot",
            '<span class="rgai-typing"><i></i><i></i><i></i></span>',
            true
        );

        try {
            const res = await fetch(AI_API, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ message: text, history: history.slice(-10) }),
            });

            let data = {};
            try {
                data = await res.json();
            } catch (_) {}

            typing.remove();

            if (!res.ok || data.error) {
                const msg =
                    data.error ||
                    (res.status === 404
                        ? "AI route nahi mila (404). Server ko ai_assistant.py se chalao."
                        : `Server error (${res.status}). Dobara try karo.`);
                addMsg("err", msg);
            } else {
                addMsg("bot", formatReply(data.reply), true);
                history.push({ role: "user", text: text });
                history.push({ role: "model", text: data.reply });
            }
        } catch (err) {
            console.error("AI chat error:", err);
            typing.remove();
            addMsg("err", "Server se connect nahi ho pa raha. Check karo ki server chal raha hai.");
        }

        busy = false;
        sendEl.disabled = false;
        inputEl.focus();
    }

    /* ---------- Events ---------- */
    fab.onclick = () => {
        panel.classList.toggle("open");
        if (panel.classList.contains("open")) {
            if (!msgsEl.children.length) showWelcome();
            inputEl.focus();
        }
    };
    panel.querySelector(".rgai-close").onclick = () => panel.classList.remove("open");
    formEl.addEventListener("submit", (e) => {
        e.preventDefault();
        send(inputEl.value);
    });
})();
