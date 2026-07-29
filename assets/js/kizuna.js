(() => {
  "use strict";
  const version = "2026-07-29";
  const prices = {
    website: ["Managed website", 250000, 29900],
    intake: ["Structured intake", 150000, 15000],
    scheduling: ["Scheduling and reminders", 75000, 10000],
    "operations-inbox": ["Operations inbox", 125000, 20000],
    "secure-documents": ["Secure documents", 125000, 15000],
    "ai-assistance": ["AI-assisted operations", 75000, 15000],
  };
  const multiplier = {"under-50":1,"50-200":1.15,"201-500":1.35,"over-500":1.75};
  const form = document.querySelector("#kizuna-configurator");
  if (!form) return;
  const buttons = [...document.querySelectorAll("[data-capability]")];
  const selected = new Set(["website", "intake"]);
  const money = new Intl.NumberFormat("en-US",{style:"currency",currency:"USD",maximumFractionDigits:0});
  const formatRange = (low, high) => `${money.format(low / 100)}–${money.format(high / 100)}`;
  function render() {
    const data = new FormData(form);
    const lines = [...selected].map((key) => ({key,label:prices[key][0],setup:prices[key][1],monthly:prices[key][2]}));
    if (data.get("bilingual")) lines.push({key:"bilingual",label:"Bilingual implementation",setup:75000,monthly:5000});
    const locations = Math.max(1, Math.min(100, Number(data.get("locations")) || 1));
    if (locations > 1) lines.push({key:"locations",label:`${locations - 1} additional location(s)`,setup:(locations-1)*75000,monthly:(locations-1)*10000});
    if (data.get("existingWebsite")) lines.push({key:"migration",label:"Existing-site migration",setup:50000,monthly:0});
    const setup = lines.reduce((sum,line) => sum + line.setup, 0);
    const monthly = Math.round(lines.reduce((sum,line) => sum + line.monthly, 0) * multiplier[data.get("volume")]);
    document.querySelector("#estimate-tier").textContent = selected.size <= 2 ? "Essential" : selected.size <= 4 ? "Operations" : "Advanced";
    document.querySelector("#setup-range").textContent = formatRange(Math.round(setup*.9),Math.round(setup*1.2));
    document.querySelector("#monthly-range").textContent = formatRange(Math.round(monthly*.9),Math.round(monthly*1.2));
    document.querySelector("#estimate-lines").innerHTML = lines.map((line) => `<li><span>${line.label}</span><b>Included</b></li>`).join("");
    const consultation = data.get("industry") === "medical" || locations > 3 || data.get("volume") === "over-500";
    document.querySelector("#consultation").hidden = !consultation;
    const summary = [`Kizuna assessment request (pricing model ${version})`,`Industry: ${data.get("industry")}`,`Locations: ${locations}`,`Monthly inquiries: ${data.get("volume")}`,`Capabilities: ${[...selected].join(", ")}`,`Implementation estimate: ${document.querySelector("#setup-range").textContent}`,`Monthly estimate: ${document.querySelector("#monthly-range").textContent}`].join("\n");
    document.querySelector("#estimate-contact").href = `mailto:tengen@shikigamitechnologies.com?subject=${encodeURIComponent("Kizuna assessment request")}&body=${encodeURIComponent(summary)}`;
  }
  buttons.forEach((button) => button.addEventListener("click", () => {
    const key = button.dataset.capability;
    if (selected.has(key) && selected.size === 1) return;
    selected.has(key) ? selected.delete(key) : selected.add(key);
    button.classList.toggle("selected", selected.has(key));
    button.setAttribute("aria-pressed", String(selected.has(key)));
    button.querySelector("b").textContent = selected.has(key) ? "Included ✓" : "Add +";
    render();
  }));
  form.addEventListener("input", render);
  render();
})();
