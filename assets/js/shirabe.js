(() => {
  const form = document.querySelector("#shirabe-form");
  if (!form) return;
  const copy = {
    es: {
      lossAmount:"Pérdida financiera informada (USD, opcional)",lossHint:"Una cantidad informada no se considera verificada independientemente.",lossBasis:"Fundamento de esa cantidad",integrity:"Estado de inquietud sobre integridad",workforce:"Condición de la fuerza laboral",conflict:"¿Se contradicen los relatos o registros disponibles?",disruption:"Interrupción relacionada",measured:"Medida",estimated:"Estimada",reported:"Informada por otra parte",unexplained_discrepancy:"Discrepancia sin explicar",allegation:"Solo señalamiento",internal_investigation:"Investigación interna informada",external_investigation:"Investigación externa informada",adequate:"Adecuada",understaffed:"Falta de personal",contractor_dependency:"Dependencia de contratistas",no:"No",yes:"Sí",vendor_outage:"Caída de proveedor",cyber_outage:"Incidente cibernético",natural_disaster:"Desastre natural",labor_disruption:"Interrupción laboral",other:"Otra",
      exit:"Salir del diagnóstico",headline:"Cuéntenos dónde se rompe el trabajo.",lede:"Trazamos qué ocurre, cuánto cuesta y qué podría valer la pena corregir—sin pedirle que compre software primero.",safeTitle:"No incluya material sensible en este formulario.",safeText:"No escriba contraseñas, expedientes de clientes, información médica, contributiva o bancaria, CUI, información clasificada ni contratos completos. Los archivos están deshabilitados intencionalmente.",signalTime:"3–5 minutos",signalTitle:"Señal rápida",signalText:"Describa el problema y reciba un resultado preliminar sobre la calidad de evidencia.",guidedTime:"8–12 minutos",guidedTitle:"Diagnóstico guiado",guidedText:"Reconstruya el flujo, la falla, la consecuencia, la evidencia y el resultado deseado.",progress:"Progreso del diagnóstico",step1:"Contexto",step2:"Problema",step3:"Flujo",step4:"Consecuencia",step5:"Revisión",draft:"El borrador permanece en este navegador hasta enviarse.",contextQuestion:"¿Quién experimenta este problema?",contextWhy:"Esto nos ayuda a entender el entorno operacional, no a juzgar el tamaño de la empresa.",name:"Su nombre",company:"Empresa",email:"Correo de trabajo",role:"Su función",industry:"Industria",size:"Tamaño aproximado del equipo",problemQuestion:"¿Qué consume demasiado tiempo, crea errores repetidos o impide la visibilidad?",problemWhy:"Use lenguaje cotidiano. Clasificaremos el patrón sin reemplazar su relato.",category:"Categoría más cercana",problem:"Describa el problema",problemHint:"¿Qué ocurre hoy y por qué es difícil?",example:"Describa el último ejemplo seguro y no sensible",exampleHint:"No pegue datos reales de clientes, empleados, contratos o finanzas.",workflowQuestion:"¿Cómo se mueve el trabajo actualmente?",workflowWhy:"Estamos reconstruyendo el proceso antes de sugerir tecnología.",trigger:"¿Qué lo inicia?",participants:"¿Quién interviene?",tools:"¿Qué herramientas se utilizan?",truth:"¿Dónde está el registro oficial?",failure:"¿Dónde normalmente se detiene, falla o requiere retrabajo?",frequency:"¿Con qué frecuencia?",volume:"Casos aproximados por mes",estimate:"Un estimado es aceptable y permanecerá identificado como tal.",consequenceQuestion:"¿Qué afecta esta falla?",consequenceWhy:"Separe lo medido de lo que actualmente es un estimado.",consequence:"Consecuencia en tiempo, costo, demora, riesgo, cliente o gerencia",evidence:"¿Qué evidencia segura podría verificarlo después?",evidenceHint:"Por ejemplo: conteos anonimizados, fechas, exportaciones o políticas. No los cargue aquí.",outcome:"¿Qué resultado medible haría que esto valiera la pena?",attempts:"¿Qué han intentado?",constraints:"Restricciones importantes",sensitivity:"¿Qué información sensible podría estar involucrada después?",reviewQuestion:"Esto es lo que entendimos.",reviewWhy:"Corrija cualquier dato inexacto. Su envío será un autorreporte hasta que se verifique independientemente.",classification:"Clasificación de evidencia",selfReport:"Autorreporte del dueño u operador · no verificado independientemente",consent:"Autorizo a Shikigami Technologies a almacenar y revisar este diagnóstico para evaluar un posible servicio. Confirmo que no incluí información sensible prohibida.",back:"Atrás",next:"Continuar",submit:"Enviar diagnóstico",received:"Su diagnóstico fue registrado.",receivedText:"Este es un autorreporte preliminar, no una recomendación aprobada. Shikigami revisará los límites de evidencia antes de proponer el próximo paso.",reference:"Referencia",completeness:"Integridad del diagnóstico",quality:"Calidad de evidencia",home:"Regresar al inicio",
      confirmScale:"Confirmo que la frecuencia y el volumen mensual describen el mismo proceso.",documents:"Sobrecarga documental",delays:"Demoras del proceso",systems:"Sistemas fragmentados",approvals:"Aprobaciones ausentes",compliance:"Cumplimiento o evidencia",intake:"Ingreso de clientes",visibility:"Visibilidad financiera u operacional",reporting:"Informes",mixed:"Problema mixto",unknown:"No se sabe",daily:"Diario",weekly:"Semanal",monthly:"Mensual",quarterly:"Trimestral",irregular:"Irregular",none:"Ninguna esperada",personal:"Información personal",financial:"Información financiera",health:"Información médica",government:"Gobierno o CUI",regulated:"Otra información regulada"
    }
  };
  const english = new Map([...document.querySelectorAll("[data-copy]")].map((node) => [node.dataset.copy, node.textContent]));
  const englishOptions = new Map([...document.querySelectorAll("[data-option]")].map((node) => [node.dataset.option, node.textContent]));
  const draftKey = "shirabe-intake-v1";
  let step = 1;

  function setLanguage(language) {
    document.documentElement.lang = language;
    form.elements.language.value = language;
    document.querySelectorAll(".language").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.language === language)));
    document.querySelectorAll("[data-copy]").forEach((node) => { node.textContent = language === "es" ? copy.es[node.dataset.copy] || english.get(node.dataset.copy) : english.get(node.dataset.copy); });
    document.querySelectorAll("[data-option]").forEach((node) => { node.textContent = language === "es" ? copy.es[node.dataset.option] || englishOptions.get(node.dataset.option) : englishOptions.get(node.dataset.option); });
    saveDraft();
  }

  function serialize() {
    return Object.fromEntries([...new FormData(form)].filter(([key]) => key !== "consent"));
  }

  function saveDraft() {
    if (document.querySelector("#diagnostic").hidden) return;
    const value = serialize();
    value.step = step;
    value.consent = form.elements.consent.checked;
    sessionStorage.setItem(draftKey, JSON.stringify(value));
  }

  function restoreDraft() {
    let draft; try { draft = JSON.parse(sessionStorage.getItem(draftKey)); } catch { return; }
    if (!draft?.mode) return;
    for (const [key, value] of Object.entries(draft)) {
      if (form.elements[key] && key !== "started_at") form.elements[key].type === "checkbox" ? form.elements[key].checked = Boolean(value) : form.elements[key].value = value;
    }
    begin(draft.mode, false);
    step = Math.min(5, Math.max(1, Number(draft.step || 1)));
    setLanguage(draft.language || "en");
    renderStep();
  }

  function begin(mode, reset = true) {
    document.querySelector("#intro").hidden = true;
    document.querySelector("#diagnostic").hidden = false;
    form.elements.mode.value = mode;
    if (reset) form.elements.started_at.value = Date.now();
    document.body.dataset.mode = mode;
    document.querySelectorAll(".guided-only").forEach((node) => node.hidden = mode === "signal");
    step = 1;
    renderStep();
    saveDraft();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validateStep() {
    const fields = [...document.querySelector(`.step[data-step="${step}"]`).querySelectorAll("input,select,textarea")].filter((field) => !field.closest("[hidden]"));
    let valid = true;
    fields.forEach((field) => {
      field.setAttribute("aria-invalid", String(!field.checkValidity()));
      if (!field.checkValidity()) valid = false;
    });
    if (!valid) fields.find((field) => !field.checkValidity())?.focus();
    return valid;
  }

  function renderStep() {
    document.querySelectorAll(".step").forEach((node) => node.classList.toggle("active", Number(node.dataset.step) === step));
    document.querySelectorAll("#progress-list li").forEach((node, index) => { node.classList.toggle("active", index + 1 === step); node.classList.toggle("complete", index + 1 < step); });
    document.querySelector("#back").hidden = step === 1;
    document.querySelector("#next").hidden = step === 5;
    document.querySelector("#submit").hidden = step !== 5;
    if (step === 5) buildReview();
    saveDraft();
  }

  function text(name) { return String(form.elements[name]?.value || "").trim(); }
  function optionLabel(value) {
    return text("language") === "es" ? copy.es[value] || value : englishOptions.get(value) || value;
  }
  function hasScaleMismatch() {
    const frequency = text("frequency"), volume = Number(text("monthly_volume") || 0);
    return (frequency === "weekly" && volume > 100) || (frequency === "monthly" && volume > 40) || (frequency === "quarterly" && volume > 12);
  }
  function buildReview() {
    const language = text("language"), t = language === "es";
    const items = [
      [t ? "Organización" : "Organization", `${text("company")} · ${text("name")} · ${text("role")}`],
      [t ? "Problema informado" : "Reported problem", text("problem")],
      [t ? "Punto de falla" : "Failure point", text("failure_point")],
      [t ? "Frecuencia y volumen estimado" : "Frequency and estimated volume", `${optionLabel(text("frequency"))} · ${text("monthly_volume") || (t ? "no indicado" : "not provided")} / ${t ? "mes" : "month"}${hasScaleMismatch() ? (t ? " · relación confirmada por la persona" : " · relationship confirmed by submitter") : ""}`],
      [t ? "Consecuencia informada" : "Reported consequence", text("consequence") || (t ? "No indicada" : "Not provided")],
      [t ? "Resultado deseado" : "Desired outcome", text("desired_outcome")],
      [t ? "Límite de sensibilidad" : "Sensitivity boundary", optionLabel(text("sensitivity"))],
    ];
    document.querySelector("#review-summary").innerHTML = items.map(([label, value]) => `<div class="review-item"><small>${escapeHtml(label)}</small><p>${escapeHtml(value)}</p></div>`).join("");
  }

  function escapeHtml(value) { const node = document.createElement("div"); node.textContent = value; return node.innerHTML; }
  function consistencyCheck() {
    const note = document.querySelector("#consistency-note"), confirmation = document.querySelector("#consistency-confirm"), es = text("language") === "es";
    const mismatch = hasScaleMismatch();
    note.hidden = !mismatch;
    confirmation.hidden = !mismatch;
    note.textContent = mismatch ? (es ? "Verificación: la frecuencia y el volumen parecen describir escalas diferentes. Confirme que ambos valores son correctos antes de continuar." : "Check: the frequency and volume appear to describe different scales. Confirm that both values are correct before continuing.") : "";
    return !mismatch || form.elements.consistency_confirm.checked;
  }
  function lossBasisCheck() {
    const amount = Number(text("claimed_loss_amount") || 0), basis = text("loss_basis"), es = text("language") === "es";
    const field = form.elements.loss_basis;
    field.setCustomValidity(amount > 0 && basis === "unknown" ? (es ? "Indique si la cantidad fue medida, estimada o informada por otra parte." : "Identify whether the amount was measured, estimated, or reported by another party.") : "");
    return field.checkValidity();
  }

  document.querySelectorAll("[data-mode]").forEach((button) => button.addEventListener("click", () => begin(button.dataset.mode)));
  document.querySelectorAll(".language").forEach((button) => button.addEventListener("click", () => setLanguage(button.dataset.language)));
  document.querySelector("#next").addEventListener("click", () => { if (step === 4 && !lossBasisCheck()) { form.elements.loss_basis.reportValidity(); return; } if (!validateStep()) return; if (step === 3 && !consistencyCheck()) { document.querySelector("#consistency-note").scrollIntoView({ behavior:"smooth", block:"center" }); return; } step += 1; renderStep(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  document.querySelector("#back").addEventListener("click", () => { step -= 1; renderStep(); window.scrollTo({ top: 0, behavior: "smooth" }); });
  form.addEventListener("input", saveDraft);
  form.elements.frequency.addEventListener("change", () => { form.elements.consistency_confirm.checked = false; consistencyCheck(); });
  form.elements.monthly_volume.addEventListener("input", () => { form.elements.consistency_confirm.checked = false; consistencyCheck(); });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateStep()) return;
    const status = document.querySelector("#form-status"), submit = document.querySelector("#submit");
    status.textContent = ""; submit.disabled = true;
    const payload = serialize(); payload.consent = form.elements.consent.checked; payload.monthly_volume = Number(payload.monthly_volume || 0);
    try {
      const response = await fetch("/api/shirabe-intake", { method:"POST", headers:{"content-type":"application/json"}, body:JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Submission failed.");
      sessionStorage.removeItem(draftKey);
      document.querySelector("#diagnostic").hidden = true; document.querySelector("#result").hidden = false;
      document.querySelector("#result-reference").textContent = result.reference;
      document.querySelector("#result-completeness").textContent = `${result.completeness}%`;
      document.querySelector("#result-quality").textContent = result.evidence_quality.replaceAll("_", " ");
      window.scrollTo({ top:0, behavior:"smooth" });
    } catch (error) { status.textContent = error.message; submit.disabled = false; }
  });
  form.elements.started_at.value = Date.now();
  restoreDraft();
})();
