/*
 * The Heavenly Smile Dental Clinic — shared funnel logic (demo).
 *  - Saves the patient's details between pages (localStorage, with a memory fallback).
 *  - Sends "lead" and "booking" events to a Google Apps Script web app (WEBHOOK_URL).
 *  - Pushes the same events to window.dataLayer for Google Tag Manager / GA4.
 *  - Builds appointment slots in the clinic's time zone and an .ics calendar file.
 *
 * Set WEBHOOK_URL to your deployed Apps Script URL (ends in /exec).
 * While it is empty, events are only logged to the console and the pages still work.
 */
(function () {
  "use strict";

  var WEBHOOK_URL = ""; // e.g. "https://script.google.com/macros/s/XXXX/exec"
  var CLINIC_TZ = "America/New_York";

  // ---------- storage ----------
  var mem = {};
  function save(key, value) {
    var json = JSON.stringify(value);
    mem[key] = json;
    try { localStorage.setItem("hsd_" + key, json); } catch (e) { /* memory only */ }
  }
  function load(key) {
    var json = null;
    try { json = localStorage.getItem("hsd_" + key); } catch (e) { json = null; }
    if (json === null && mem[key] !== undefined) json = mem[key];
    try { return json ? JSON.parse(json) : null; } catch (e) { return null; }
  }

  function newId() {
    return "HSD-" + Date.now().toString(36).toUpperCase() + "-" + Math.random().toString(36).slice(2, 6).toUpperCase();
  }

  function captureUtm() {
    var params = new URLSearchParams(window.location.search);
    var found = load("utm") || {};
    ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "fbclid", "gclid"].forEach(function (k) {
      if (params.get(k)) found[k] = params.get(k).slice(0, 200);
    });
    save("utm", found);
    return found;
  }

  // ---------- sending ----------
  // Apps Script does not return CORS headers, so posts go as text/plain with mode "no-cors".
  function send(event, payload) {
    var body = Object.assign({ event: event, sentAt: new Date().toISOString() }, payload);
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push({ event: "dental_" + event, service: payload.service || "", visit: payload.patientType || "" });
    if (!WEBHOOK_URL) {
      console.info("[funnel] WEBHOOK_URL not set. Not sent:", body);
      return Promise.resolve({ sent: false });
    }
    return fetch(WEBHOOK_URL, {
      method: "POST", mode: "no-cors",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(body)
    }).then(function () { return { sent: true }; })
      .catch(function (err) { console.warn("[funnel] send failed", err); return { sent: false }; });
  }

  // ---------- time zone + slots ----------
  function partsInZone(date, tz) {
    var out = {};
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit"
    }).formatToParts(date).forEach(function (p) { out[p.type] = p.value; });
    return { year: +out.year, month: +out.month, day: +out.day, hour: +out.hour, minute: +out.minute, second: +out.second };
  }
  function zonedToDate(y, m, d, h, mi, tz) {
    var guess = Date.UTC(y, m - 1, d, h, mi, 0);
    var p = partsInZone(new Date(guess), tz);
    var off = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - guess;
    var result = guess - off;
    var p2 = partsInZone(new Date(result), tz);
    var off2 = Date.UTC(p2.year, p2.month - 1, p2.day, p2.hour, p2.minute, p2.second) - result;
    if (off2 !== off) result = guess - off2;
    return new Date(result);
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // Next `count` open days after today (clinic time). Mon–Fri 9am–5pm, Sat 9am–1pm, closed Sunday. Hourly slots.
  function buildSlots(count) {
    var today = partsInZone(new Date(), CLINIC_TZ);
    var cursor = Date.UTC(today.year, today.month - 1, today.day, 12);
    var days = [];
    while (days.length < (count || 6)) {
      cursor += 86400000;
      var c = new Date(cursor), dow = c.getUTCDay();
      if (dow === 0) continue;
      var y = c.getUTCFullYear(), m = c.getUTCMonth() + 1, d = c.getUTCDate();
      var close = dow === 6 ? 13 : 17;
      var label = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(c);
      var slots = [];
      for (var h = 9; h < close; h++) {
        if (h === 12 && dow !== 6) continue; // lunch break on weekdays
        slots.push({
          key: y + "-" + pad(m) + "-" + pad(d) + " " + pad(h) + ":00",
          label: (((h + 11) % 12) + 1) + ":00 " + (h < 12 ? "am" : "pm"),
          iso: zonedToDate(y, m, d, h, 0, CLINIC_TZ).toISOString()
        });
      }
      days.push({ label: label, slots: slots });
    }
    return days;
  }

  function renderSlotPicker(root, days, onPick) {
    root.innerHTML = "";
    var dayRow = document.createElement("div"); dayRow.className = "slot-days"; dayRow.setAttribute("role", "tablist"); dayRow.setAttribute("aria-label", "Choose a day");
    var grid = document.createElement("div"); grid.className = "slot-times"; grid.setAttribute("role", "group");
    root.appendChild(dayRow); root.appendChild(grid);
    function show(i) {
      Array.prototype.forEach.call(dayRow.children, function (b, j) { b.setAttribute("aria-selected", i === j ? "true" : "false"); });
      grid.setAttribute("aria-label", "Times on " + days[i].label);
      grid.innerHTML = "";
      days[i].slots.forEach(function (s) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "slot-time"; b.textContent = s.label; b.setAttribute("aria-pressed", "false");
        b.addEventListener("click", function () {
          Array.prototype.forEach.call(grid.children, function (x) { x.setAttribute("aria-pressed", "false"); });
          b.setAttribute("aria-pressed", "true");
          onPick(s, days[i]);
        });
        grid.appendChild(b);
      });
    }
    days.forEach(function (d, i) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "slot-day"; b.setAttribute("role", "tab");
      var parts = d.label.split(", ");
      b.innerHTML = "<span>" + parts[0] + "</span><strong>" + (parts[1] || "") + "</strong>";
      b.addEventListener("click", function () { show(i); onPick(null, d); });
      dayRow.appendChild(b);
    });
    show(0);
  }

  // ---------- calendar file ----------
  function stamp(d) {
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + "T" + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + "Z";
  }
  function icsEsc(t) { return String(t).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n"); }
  function buildIcs(o) {
    var start = new Date(o.startIso), end = new Date(start.getTime() + (o.minutes || 60) * 60000);
    return [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Heavenly Smile Demo//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
      "BEGIN:VEVENT", "UID:" + o.uid + "@heavenly-smile-demo", "DTSTAMP:" + stamp(new Date()),
      "DTSTART:" + stamp(start), "DTEND:" + stamp(end),
      "SUMMARY:" + icsEsc(o.title), "DESCRIPTION:" + icsEsc(o.description || ""), "LOCATION:" + icsEsc(o.location || ""),
      "END:VEVENT", "END:VCALENDAR"
    ].join("\r\n");
  }
  function downloadIcs(o) {
    var url = URL.createObjectURL(new Blob([buildIcs(o)], { type: "text/calendar;charset=utf-8" }));
    var a = document.createElement("a");
    a.href = url; a.download = (o.filename || "appointment") + ".ics";
    document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 500);
  }

  // ---------- validation ----------
  function validEmail(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(v).trim()); }
  function validPhone(v) { return String(v).replace(/\D/g, "").length >= 10; }
  function checkForm(form, rules, labels) {
    var missing = [];
    Object.keys(rules).forEach(function (name) {
      var el = form.elements[name];
      if (!el) return;
      var v = el.type === "checkbox" ? el.checked : String(el.value || "").trim();
      var ok = rules[name] === "email" ? validEmail(v) : rules[name] === "phone" ? validPhone(v) : rules[name] === "check" ? v === true : !!v;
      el.setAttribute("aria-invalid", ok ? "false" : "true");
      if (!ok) missing.push(labels[name] || name);
    });
    return missing;
  }

  captureUtm();

  window.Funnel = {
    CLINIC_TZ: CLINIC_TZ, save: save, load: load, newId: newId, send: send,
    buildSlots: buildSlots, renderSlotPicker: renderSlotPicker, zonedToDate: zonedToDate,
    buildIcs: buildIcs, downloadIcs: downloadIcs,
    validEmail: validEmail, validPhone: validPhone, checkForm: checkForm
  };
})();
