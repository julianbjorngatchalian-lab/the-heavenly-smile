/**
 * The Heavenly Smile Dental Clinic — funnel automation (Google Apps Script). Demo.
 *
 *   "lead"    → new row in Leads + instant alert email to the clinic
 *   "booking" → row set to Booked + confirmation email to the patient
 *   followUps() runs hourly:
 *     - unfinished booking: lead gave details but picked no time → one "finish booking" email after 2 hours
 *     - reminder: one email ~24 hours before the appointment
 *     - no-show: clinic sets Status to "No-show" → one rebooking email
 *
 * Setup (details in README.md): paste into Extensions → Apps Script on a new Google Sheet,
 * set CONFIG, run setup() once, deploy as Web app (Execute as: Me, Who has access: Anyone),
 * then paste the /exec URL into assets/funnel.js.
 */

var CONFIG = {
  CLINIC: "The Heavenly Smile Dental Clinic",
  PHONE: "(512) 555-0142",
  ALERT_EMAIL: "you@example.com",                 // where new-lead alerts go
  SITE_URL: "https://YOUR-SITE.onrender.com/",    // live site, with trailing slash
  TZ: "America/New_York",
  NUDGE_AFTER_HOURS: 2,
  REMINDER_HOURS_BEFORE: 24
};

var HEADERS = [
  "Lead ID", "Created", "First name", "Last name", "Email", "Phone",
  "Service", "Patient type", "Insurance", "UTM source", "UTM campaign",
  "Status", "Appointment (ET)", "Appointment ISO",
  "Nudge sent", "Reminder sent", "No-show follow-up sent", "Last update"
];
var COL = {}; HEADERS.forEach(function (h, i) { COL[h] = i + 1; });

/* ---------------- web app ---------------- */

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (!d.leadId) return json_({ ok: false, error: "Missing leadId" });
    if (d.event === "lead") handleLead_(d);
    else if (d.event === "booking") handleBooking_(d);
    else return json_({ ok: false, error: "Unknown event" });
    return json_({ ok: true });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() { return json_({ ok: true, service: "heavenly-smile-webhook" }); }

/* ---------------- handlers ---------------- */

function handleLead_(d) {
  var sh = sheet_(), now = new Date(), utm = d.utm || {};
  var v = {
    "Lead ID": clean_(d.leadId, 60), "Created": now,
    "First name": clean_(d.firstName, 60), "Last name": clean_(d.lastName, 60),
    "Email": clean_(d.email, 120), "Phone": clean_(d.phone, 25),
    "Service": clean_(d.service, 60), "Patient type": clean_(d.patientType, 30), "Insurance": clean_(d.insurance, 20),
    "UTM source": clean_(utm.utm_source, 100), "UTM campaign": clean_(utm.utm_campaign, 100),
    "Status": "New lead", "Last update": now
  };
  var row = findRow_(sh, d.leadId);
  if (row) writeFields_(sh, row, v);
  else sh.appendRow(HEADERS.map(function (h) { return cell_(v[h] !== undefined ? v[h] : ""); }));

  MailApp.sendEmail({
    to: CONFIG.ALERT_EMAIL,
    subject: "New patient lead: " + v["First name"] + " " + v["Last name"] + " – " + v["Service"],
    body: [
      "New lead from the website. Call within 5 minutes if they don't finish booking.",
      "",
      "Name: " + v["First name"] + " " + v["Last name"],
      "Phone: " + v["Phone"],
      "Email: " + v["Email"],
      "Service: " + v["Service"],
      "Patient: " + v["Patient type"] + " | Insurance: " + v["Insurance"],
      "Source: " + (v["UTM source"] || "direct") + (v["UTM campaign"] ? " / " + v["UTM campaign"] : ""),
      "Lead ID: " + v["Lead ID"],
      "",
      "Sheet: " + SpreadsheetApp.getActiveSpreadsheet().getUrl()
    ].join("\n")
  });
}

function handleBooking_(d) {
  var sh = sheet_(), now = new Date();
  var when = Utilities.parseDate(String(d.slotLocal), d.slotTz || CONFIG.TZ, "yyyy-MM-dd HH:mm");
  if (isNaN(when.getTime())) throw new Error("Bad slotLocal: " + d.slotLocal);
  var label = Utilities.formatDate(when, CONFIG.TZ, "EEE, MMM d 'at' h:mm a") + " ET";

  var row = findRow_(sh, d.leadId);
  if (!row) {
    sh.appendRow(HEADERS.map(function (h) {
      return cell_(({ "Lead ID": clean_(d.leadId, 60), "Created": now, "First name": clean_(d.firstName, 60),
        "Last name": clean_(d.lastName, 60), "Email": clean_(d.email, 120), "Phone": clean_(d.phone, 25),
        "Service": clean_(d.service, 60), "Patient type": clean_(d.patientType, 30) })[h] || "");
    }));
    row = sh.getLastRow();
  }
  var moved = sh.getRange(row, COL["Status"]).getValue() === "Booked";
  writeFields_(sh, row, {
    "Status": "Booked", "Appointment (ET)": label, "Appointment ISO": when.toISOString(),
    "Reminder sent": "", "No-show follow-up sent": "", "Last update": now
  });

  var email = sh.getRange(row, COL["Email"]).getValue();
  var name = sh.getRange(row, COL["First name"]).getValue();
  var service = sh.getRange(row, COL["Service"]).getValue();
  MailApp.sendEmail({
    to: email,
    subject: (moved ? "Your new time: " : "You're booked: ") + label + " – " + CONFIG.CLINIC,
    body: [
      "Hi " + name + ",",
      "",
      (moved ? "Your appointment has been moved. " : "") + "Your " + service + " is confirmed for " + label + ".",
      "",
      "Please bring a photo ID, your dental insurance card if you have one, and a list of any medicines you take.",
      "Arrive 10 minutes early to fill in a short health form.",
      "",
      "Need to change it? Call " + CONFIG.PHONE + " at least 24 hours ahead.",
      "Reference: " + d.leadId,
      "",
      "— " + CONFIG.CLINIC,
      "",
      "Demo message from a portfolio funnel. No real appointment was made."
    ].join("\n")
  });
}

/* ---------------- hourly follow-ups ---------------- */

function followUps() {
  var sh = sheet_(), rows = sh.getDataRange().getValues(), now = Date.now();
  for (var i = 1; i < rows.length; i++) {
    var r = rows[i], row = i + 1;
    var status = r[COL["Status"] - 1], email = r[COL["Email"] - 1], name = r[COL["First name"] - 1];
    if (!email) continue;

    // 1. Gave details but didn't pick a time
    var created = new Date(r[COL["Created"] - 1]).getTime();
    if (status === "New lead" && !r[COL["Nudge sent"] - 1] && !isNaN(created) && now - created >= CONFIG.NUDGE_AFTER_HOURS * 3600000) {
      send_(email, "Finish booking your visit – " + CONFIG.CLINIC,
        "Hi " + name + ",\n\nYou started booking your " + r[COL["Service"] - 1] + " but didn't pick a time yet. It takes 30 seconds:\n" +
        CONFIG.SITE_URL + "#book\n\nOr call us at " + CONFIG.PHONE + " and we'll book it for you.");
      mark_(sh, row, "Nudge sent");
      continue;
    }

    // 2. Reminder before the appointment
    var start = new Date(r[COL["Appointment ISO"] - 1]).getTime();
    if (status === "Booked" && !r[COL["Reminder sent"] - 1] && !isNaN(start) && start > now && start - now <= CONFIG.REMINDER_HOURS_BEFORE * 3600000) {
      send_(email, "Reminder: your visit " + r[COL["Appointment (ET)"] - 1] + " – " + CONFIG.CLINIC,
        "Hi " + name + ",\n\nA quick reminder: your " + r[COL["Service"] - 1] + " is on " + r[COL["Appointment (ET)"] - 1] +
        ".\nPlease arrive 10 minutes early. Can't make it? Call " + CONFIG.PHONE + " so we can offer the time to someone else.");
      mark_(sh, row, "Reminder sent");
      continue;
    }

    // 3. Missed appointment (clinic sets Status to "No-show")
    if (status === "No-show" && !r[COL["No-show follow-up sent"] - 1]) {
      send_(email, "We missed you – want a new time? – " + CONFIG.CLINIC,
        "Hi " + name + ",\n\nWe had you down for a visit but didn't get to see you. No problem, it happens.\nPick a new time here: " +
        CONFIG.SITE_URL + "#book\nor call " + CONFIG.PHONE + ".");
      mark_(sh, row, "No-show follow-up sent");
    }
  }
}

/* ---------------- one-time setup ---------------- */

function setup() {
  var sh = sheet_();
  sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]).setFontWeight("bold");
  sh.setFrozenRows(1);
  var rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(["New lead", "Contacted", "Booked", "Showed", "No-show", "Cancelled"], true)
    .setAllowInvalid(false).build();
  sh.getRange(2, COL["Status"], sh.getMaxRows() - 1, 1).setDataValidation(rule);
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "followUps") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("followUps").timeBased().everyHours(1).create();
}

/* ---------------- helpers ---------------- */

function send_(to, subject, body) {
  MailApp.sendEmail({ to: to, subject: subject, body: body + "\n\n— " + CONFIG.CLINIC + "\n\nDemo message from a portfolio funnel." });
}
function mark_(sh, row, header) {
  sh.getRange(row, COL[header]).setValue(new Date());
  sh.getRange(row, COL["Last update"]).setValue(new Date());
}
function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName("Leads") || ss.insertSheet("Leads");
  if (sh.getLastRow() === 0) sh.appendRow(HEADERS);
  return sh;
}
function findRow_(sh, leadId) {
  var last = sh.getLastRow();
  if (last < 2) return 0;
  var ids = sh.getRange(2, COL["Lead ID"], last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (ids[i][0] === leadId) return i + 2;
  return 0;
}
function writeFields_(sh, row, fields) {
  Object.keys(fields).forEach(function (h) { if (COL[h]) sh.getRange(row, COL[h]).setValue(cell_(fields[h])); });
}
function clean_(v, max) { return String(v === undefined || v === null ? "" : v).trim().slice(0, max || 200); }
// Text starting with = + - @ is stored as plain text, not run as a spreadsheet formula.
function cell_(v) { return typeof v === "string" && /^[=+\-@]/.test(v) ? "'" + v : v; }
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
