const API = {
  legacy: "http://localhost:4000",
  migrated: "http://localhost:4001",
};

async function checkHealth() {
  for (const mode of ["legacy", "migrated"]) {
    const dot = document.querySelector(`#${mode}-status .dot`);
    try {
      const res = await fetch(`${API[mode]}/health`);
      if (res.ok) {
        dot.classList.add("up");
        dot.classList.remove("down");
      } else {
        throw new Error("not ok");
      }
    } catch {
      dot.classList.add("down");
      dot.classList.remove("up");
    }
  }
}
checkHealth();
setInterval(checkHealth, 5000);

async function uploadFile(mode) {
  const input = document.getElementById(`${mode}-file`);
  const resultBox = document.getElementById(`${mode}-upload-result`);

  if (!input.files.length) {
    resultBox.textContent = "Choose a file first.";
    return;
  }

  const formData = new FormData();
  formData.append("file", input.files[0]);

  resultBox.textContent = "Uploading...";
  try {
    const res = await fetch(`${API[mode]}/upload`, { method: "POST", body: formData });
    const data = await res.json();
    resultBox.textContent = JSON.stringify(data, null, 2);
    if (data.record && data.record.id) {
      resultBox.textContent += `\n\nRecord id: ${data.record.id}`;
    }
  } catch (err) {
    resultBox.textContent = `Error: ${err.message}. Is the ${mode} server running?`;
  }
}

async function runBatch(mode) {
  const count = document.getElementById(`${mode}-count`).value || 10;
  const resultBox = document.getElementById(`${mode}-batch-result`);
  resultBox.textContent = "Running...";

  try {
    const start = performance.now();
    const res = await fetch(`${API[mode]}/batch-process`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: Number(count) }),
    });
    const data = await res.json();
    const clientMs = Math.round(performance.now() - start);
    resultBox.textContent = `Client-measured time: ${clientMs}ms\n\n${JSON.stringify(data, null, 2)}`;
  } catch (err) {
    resultBox.textContent = `Error: ${err.message}. Is the ${mode} server running?`;
  }
}

async function doLookup() {
  const id = document.getElementById("lookup-id").value.trim();
  const resultBox = document.getElementById("lookup-result");
  if (!id) {
    resultBox.textContent = "Paste a record id first.";
    return;
  }
  resultBox.textContent = "Looking up...";
  try {
    const res = await fetch(`${API.migrated}/lookup/${id}`);
    const data = await res.json();
    resultBox.textContent = JSON.stringify(data, null, 2);
  } catch (err) {
    resultBox.textContent = `Error: ${err.message}`;
  }
}

async function loadRecords(mode) {
  const list = document.getElementById(`${mode}-records`);
  list.innerHTML = "<li>Loading...</li>";
  try {
    const res = await fetch(`${API[mode]}/records`);
    const data = await res.json();
    if (!data.records || data.records.length === 0) {
      list.innerHTML = "<li>No records yet.</li>";
      return;
    }
    list.innerHTML = data.records
      .map((r) => `<li>${r.originalName || r.id} &mdash; ${r.id}</li>`)
      .join("");
  } catch (err) {
    list.innerHTML = `<li>Error: ${err.message}</li>`;
  }
}

async function runComparison() {
  const box = document.getElementById("compare-result");
  box.innerHTML = "Running both...";

  try {
    const [legacyRes, migratedRes] = await Promise.all([
      fetch(`${API.legacy}/batch-process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 10 }),
      }).then((r) => r.json()),
      fetch(`${API.migrated}/batch-process`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ count: 10 }),
      }).then((r) => r.json()),
    ]);

    box.innerHTML = `
      <div class="compare-bar legacy">
        <div class="label">Legacy (serial, 10 items)</div>
        <div class="value">${legacyRes.durationMs}ms</div>
      </div>
      <div class="compare-bar migrated">
        <div class="label">Migrated (enqueue time)</div>
        <div class="value">${migratedRes.enqueueDurationMs}ms</div>
      </div>
    `;
  } catch (err) {
    box.textContent = `Error: ${err.message}. Make sure both servers are running.`;
  }
}
