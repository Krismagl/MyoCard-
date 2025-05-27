document.getElementById('connectBtn').addEventListener('click', connectBLE);

// === CHART DE RMS ===
const rmsChartCtx = document.getElementById('rmsChart').getContext('2d');
const rmsChart = new Chart(rmsChartCtx, {
  type: 'line',
  data: {
    labels: [],
    datasets: [{
      label: 'RMS EMG (mV)',
      data: [],
      borderColor: 'rgba(33, 150, 243, 1)',
      tension: 0.1,
      fill: false
    }]
  },
  options: {
    animation: false,
    responsive: true,
    scales: { x: { display: false }, y: { beginAtZero: true } }
  }
});

let bufferDatosFase = [];
let sesionActiva = false;
let faseActual = "";
let intervaloAlmacenamiento = null;

function connectBLE() {
  navigator.bluetooth.requestDevice({
    filters: [{ namePrefix: 'ESP32' }],
    optionalServices: ['0000ffe0-0000-1000-8000-00805f9b34fb']
  })
  .then(device => device.gatt.connect())
  .then(server => server.getPrimaryService('0000ffe0-0000-1000-8000-00805f9b34fb'))
  .then(service => service.getCharacteristic('0000ffe1-0000-1000-8000-00805f9b34fb'))
  .then(characteristic => {
    characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', handleData);
    console.log("Conectado al ESP32");
  })
  .catch(console.error);
}
function handleData(event) {
  const decoder = new TextDecoder('utf-8');
  const data = decoder.decode(event.target.value).trim();
  const valores = data.split(',');

  if (valores.length < 8) return;

  const [rms, mf, bpm, hrv, rawECG, filteredECG, fatigaIndex, fatigaNivel] =
    valores.map((v, i) => i === 7 ? v.trim() : parseFloat(v));
  const ahora = new Date().toISOString();

  updateRMS(rms);
  updateMDF(mf);
  updateBpm(bpm);
  updateHrv(hrv);
  updateFatigaTexto(fatigaNivel);

  if (sesionActiva) {
    bufferDatosFase.push({
      fecha: ahora, rms, mf, bpm, hrv, rawECG, filteredECG,
      fatigaIndex, fatigaNivel, fase: faseActual
    });
  }
}

function updateRMS(rms) {
  document.getElementById('rmsVal').textContent = `RMS: ${rms.toFixed(2)} mV`;
  const now = new Date().toLocaleTimeString();
  if (rmsChart.data.labels.length >= 50) {
    rmsChart.data.labels.shift();
    rmsChart.data.datasets[0].data.shift();
  }
  rmsChart.data.labels.push(now);
  rmsChart.data.datasets[0].data.push(rms);
  rmsChart.update();
}

const bpmGaugeCtx = document.getElementById('bpmGauge').getContext('2d');

let bpmNeedleValue = 40; // Valor inicial

let bpmGaugeChart = new Chart(bpmGaugeCtx, {
  type: 'doughnut',
  data: {
    labels: ['Zona Baja', 'Zona Media', 'Zona Alta', 'Peligro'],
    datasets: [{
      data: [40, 40, 40, 80],
      backgroundColor: ['#4caf50', '#ffc107', '#ff9800', '#f44336'],
      borderWidth: 0,
      cutout: '80%',
      circumference: 270,
      rotation: 225
    }]
  },
  options: {
    responsive: false,
    plugins: {
      legend: { display: false },
      annotation: {

      }
    }
  },
  plugins: [{
    id: 'gaugeNeedle',
    afterDraw: chart => {
      const needleValue = bpmNeedleValue;
      const angle = (needleValue - 40) / (200 - 40) * Math.PI * 1.5 + Math.PI * 0.75;
      const cx = chart.chartArea.left + chart.chartArea.width / 2;
      const cy = chart.chartArea.top + chart.chartArea.height / 2;
      const radius = chart._metasets[0].data[0].outerRadius;

      const ctx = chart.ctx;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(radius * 0.9, 0);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'white';
      ctx.stroke();
      ctx.restore();
    }
  }]
});


function updateMDF(mf) {
  document.getElementById('mfVal').textContent = `MF: ${mf.toFixed(1)} Hz`;
}

function updateBpm(bpm) {
  bpmNeedleValue = bpm; // actualiza valor de la aguja
  document.getElementById('bpmVal').textContent = bpm.toFixed(0);
  bpmGaugeChart.update();
}



function updateHrv(hrv) {
  document.getElementById('hrvVal').textContent = `HRV: ${hrv.toFixed(1)} ms`;
  document.getElementById('hrvIndicator').style.left = `${Math.min(100, Math.max(0, hrv))}%`;
}

function updateFatigaTexto(nivel) {
  document.getElementById('fatigaIndex').textContent = `Nivel: ${nivel}`;
  const fatigaIndicator = document.getElementById('fatigaIndicator');
  const percent = nivel === "Alta" ? 90 : nivel === "Moderada" ? 50 : 10;
  fatigaIndicator.style.left = percent + "%";
}

function iniciarSesion() {
  faseActual = document.getElementById("faseSelect").value;
  if (!faseActual) return alert("Selecciona una fase válida.");
  bufferDatosFase = [];
  sesionActiva = true;
  intervaloAlmacenamiento = setInterval(() => {
    console.log("Capturando datos fase: " + faseActual);
  }, 30000);
  alert("Sesión iniciada. Fase: " + faseActual);
}

function detenerSesion() {
  sesionActiva = false;
  clearInterval(intervaloAlmacenamiento);
  exportarSesionPorFase();
  alert(`Sesión ${faseActual} finalizada. ${bufferDatosFase.length} datos almacenados.`);
}

function exportarSesionPorFase() {
  if (bufferDatosFase.length === 0) return alert("No hay datos para exportar.");
  const hoy = new Date().toISOString().slice(0, 10);
  let csv = "data:text/csv;charset=utf-8,Fecha,RMS,MF,BPM,HRV,rawECG,filteredECG,ÍndiceFatiga,NivelFatiga,Fase\n";
  bufferDatosFase.forEach(d => {
    csv += `${d.fecha},${d.rms},${d.mf},${d.bpm},${d.hrv},${d.rawECG},${d.filteredECG},${d.fatigaIndex},${d.fatigaNivel},${d.fase}\n`;
  });
  const uri = encodeURI(csv);
  const a = document.createElement("a");
  a.setAttribute("href", uri);
  a.setAttribute("download", `Sesion_${hoy}_${faseActual}.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
// === ANÁLISIS SEMANAL VISUAL ACTUALIZADO ===
function analizarSemana() {
  const input = document.getElementById("archivoCSV");
  const files = input.files;
  if (!files.length) return alert("Selecciona los archivos .csv de la semana completa");

  const dias = {};
  const leerArchivo = file => new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => {
      const lines = reader.result.split("\n").slice(1).filter(Boolean);
      const datos = lines.map(line => {
        const [fecha, rms, mf, bpm, hrv, raw, filt, fatiga, nivel, fase] = line.split(',');
        const dia = fecha.slice(0, 10);
        return {
          fecha, dia,
          rms: +rms, mf: +mf, bpm: +bpm, hrv: +hrv,
          rawECG: +raw, filteredECG: +filt,
          fatigaIndex: +fatiga, fatigaNivel: nivel.trim(), fase: fase.trim()
        };
      });
      if (datos.length) {
        const dia = datos[0].dia;
        const fase = datos[0].fase;
        if (!dias[dia]) dias[dia] = { Pre: [], Durante: [], Post: [] };
        dias[dia][fase] = datos;
      }
      resolve();
    };
    reader.readAsText(file);
  });

  Promise.all([...files].map(leerArchivo)).then(() => {
    const diasCompletos = Object.entries(dias).filter(([_, fases]) =>
      fases.Pre.length && fases.Durante.length && fases.Post.length
    );
    if (diasCompletos.length < 3) {
      document.getElementById("resultadoAnalisisSemana").innerHTML =
        "<p style='color:orange'>Se requieren al menos 3 días completos (Pre, Durante, Post) para un análisis semanal.</p>";
      return;
    }

    const resumen = [];
    let diasFatigaAlta = 0;

    diasCompletos.forEach(([dia, fases], i) => {
      const prom = (arr, key) => arr.reduce((a, b) => a + b[key], 0) / arr.length;

      const mfPre = prom(fases.Pre, 'mf');
      const mfDurante = prom(fases.Durante, 'mf');
      const mfPost = prom(fases.Post, 'mf');

      const rmsPre = prom(fases.Pre, 'rms');
      const rmsDurante = prom(fases.Durante, 'rms');
      const rmsPost = prom(fases.Post, 'rms');

      const bpmPre = prom(fases.Pre, 'bpm');
      const bpmDurante = prom(fases.Durante, 'bpm');
      const bpmPost = prom(fases.Post, 'bpm');

      const hrvPre = prom(fases.Pre, 'hrv');
      const hrvDurante = prom(fases.Durante, 'hrv');
      const hrvPost = prom(fases.Post, 'hrv');

      const fatiga = prom(fases.Post, 'fatigaIndex');
      const fatigaNivel = fases.Post[0].fatigaNivel;

      // === Detectores diarios ===
      const fatigaAlta = fatiga > 0.6 || fatigaNivel === "Alta";
      if (fatigaAlta) diasFatigaAlta++;

      const deltaMF = ((mfPre - mfPost) / mfPre) * 100;
      const deltaRMS = ((rmsPost - rmsPre) / rmsPre) * 100;
      const deltaHRV = ((hrvPre - hrvPost) / hrvPre) * 100;

      resumen.push({
        dia, mfPre, mfDurante, mfPost,
        rmsPre, rmsDurante, rmsPost,
        bpmPre, bpmDurante, bpmPost,
        hrvPre, hrvDurante, hrvPost,
        fatiga, fatigaNivel, deltaMF, deltaRMS, deltaHRV,
        fatigaAlta
      });
    });

    mostrarResumenVisual(resumen, diasFatigaAlta);
  });
}
function mostrarResumenVisual(resumen, diasFatigaAlta) {
  const contenedor = document.getElementById("resultadoAnalisisSemana");

  const inicio = resumen[0];
  const fin = resumen[resumen.length - 1];

  const mfDescenso = ((inicio.mfPre - fin.mfPre) / inicio.mfPre) * 100;
  const hrvCaida = ((inicio.hrvPre - fin.hrvPre) / inicio.hrvPre) * 100;
  const bpmSubida = fin.bpmPre - inicio.bpmPre;

  let diagnostico = "";
  let colorFondo = "";
  if (diasFatigaAlta >= 3 || mfDescenso > 10 || hrvCaida > 20 || bpmSubida > 5) {
    diagnostico = "🟥 Posible Sobreentrenamiento";
    colorFondo = "#b71c1c";
  } else if (diasFatigaAlta >= 1 || hrvCaida > 10 || mfDescenso > 5) {
    diagnostico = "🟡 Fatiga Leve Acumulada";
    colorFondo = "#f57f17";
  } else {
    diagnostico = "🟢 Recuperación Adecuada";
    colorFondo = "#2e7d32";
  }

  let html = `
    <div style="background:${colorFondo};padding:1rem;border-radius:12px;margin-bottom:1.5rem">
      <h3 style="margin:0;color:white">${diagnostico}</h3>
      <p style="margin-top:0.5rem;color:white">
        <strong>Resumen semanal:</strong><br>
        MF Pre ↓ <strong>${mfDescenso.toFixed(1)}%</strong> |
        HRV Pre ↓ <strong>${hrvCaida.toFixed(1)}%</strong> |
        BPM Pre ↑ <strong>${bpmSubida.toFixed(1)} lpm</strong><br>
        Días con fatiga alta: <strong>${diasFatigaAlta}</strong> de ${resumen.length}
      </p>
    </div>

    
  `;

  html += `
    <h4 style="margin-top:2rem;">📊 Comparativa diaria</h4>
    <table border='1' cellpadding='6' style="width:100%;text-align:center">
      <tr>
        <th>Día</th><th>MF Δ%</th><th>RMS Δ%</th><th>HRV Δ%</th>
        <th>BPM Pre</th><th>HRV Pre</th><th>Fatiga</th><th>Alerta</th>
      </tr>
  `;

  resumen.forEach(r => {
    const alerta = (r.deltaMF > 10 || r.deltaRMS > 10 || r.deltaHRV > 20 || r.fatigaAlta);
    const color = alerta ? "🔴" : "🟢";
    html += `<tr>
      <td>${r.dia}</td>
      <td>${r.deltaMF.toFixed(1)}%</td>
      <td>${r.deltaRMS.toFixed(1)}%</td>
      <td>${r.deltaHRV.toFixed(1)}%</td>
      <td>${r.bpmPre.toFixed(1)}</td>
      <td>${r.hrvPre.toFixed(1)}</td>
      <td>${r.fatiga.toFixed(2)}</td>
      <td>${color}</td>
    </tr>`;
  });

  html += "</table>";
  document.getElementById("btnAyudaGraficas").style.display = "block";

  contenedor.innerHTML = html;

  const labels = resumen.map(r => r.dia);
  graficarTresFases("graficaHRV", labels, resumen.map(r => r.hrvPre), resumen.map(r => r.hrvDurante), resumen.map(r => r.hrvPost), "HRV (ms)");
  graficarTresFases("graficaBPM", labels, resumen.map(r => r.bpmPre), resumen.map(r => r.bpmDurante), resumen.map(r => r.bpmPost), "BPM");
  graficarTresFases("graficaFatiga", labels, resumen.map(r => r.fatiga), resumen.map(r => r.fatiga), resumen.map(r => r.fatiga), "Índice de Fatiga");
  graficarTresFases("graficaMF", labels, resumen.map(r => r.mfPre), resumen.map(r => r.mfDurante), resumen.map(r => r.mfPost), "MF (Hz)");
  graficarTresFases("graficaRMS", labels, resumen.map(r => r.rmsPre), resumen.map(r => r.rmsDurante), resumen.map(r => r.rmsPost), "RMS (mV)");
  graficarResumenEstiloGarmin("graficaResumenEstiloGarmin", hrvCaida, mfDescenso, bpmSubida * 5, diasFatigaAlta, resumen.length);


}

function graficarResumenEstiloGarmin(canvasId, hrvDrop, mfDrop, bpmRise, diasFatiga, totalDias) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;

  const ctx = canvas.getContext("2d");

  if (window[canvasId] instanceof Chart && typeof window[canvasId].destroy === "function") {
    window[canvasId].destroy();
  }

  const fatigaPct = (diasFatiga / totalDias) * 100;

  window[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: ['HRV ↓ (%)', 'MF ↓ (%)', 'BPM ↑ (lpm)', '% Días con Fatiga Alta'],
      datasets: [{
        label: 'Resumen Semanal',
        data: [hrvDrop, mfDrop, bpmRise, fatigaPct],
        backgroundColor: [
          '#42a5f5', '#ab47bc', '#ff7043', '#ef5350'
        ],
        borderRadius: 8
      }]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { display: false },
        title: {
          display: true,
          text: 'Resumen de Carga Fisiológica Semanal',
          color: '#fff',
          font: { size: 18 }
        },
        tooltip: {
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${ctx.parsed.y.toFixed(1)}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#fff', font: { weight: 'bold' } }
        },
        y: {
          beginAtZero: true,
          suggestedMax: 100,
          ticks: {
            color: '#fff',
            callback: value => value + '%'
          }
        }
      }
    }
  });
}

function graficarTresFases(canvasId, labels, datosPre, datosDurante, datosPost, label) {
  const canvas = document.getElementById(canvasId);
  if (!canvas) return;
  const ctx = canvas.getContext("2d");

  if (window[canvasId] && typeof window[canvasId].destroy === 'function') {
    window[canvasId].destroy();
  }

  window[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: `${label} Pre`, data: datosPre, backgroundColor: "#d442b4" },
        { label: `${label} Durante`, data: datosDurante, backgroundColor: "#e180c1" },
        { label: `${label} Post`, data: datosPost, backgroundColor: "#66a9f0" }
      ]
    },
    options: {
      responsive: true,
      plugins: {
        legend: { position: 'top' },
        title: { display: true, text: `Comparación de ${label} por Fase` }
      },
      scales: {
        y: { beginAtZero: true }
      }
    }
  });
}
function abrirModal() {
  document.getElementById("ayudaModal").style.display = "block";
}
function cerrarModal() {
  document.getElementById("ayudaModal").style.display = "none";
}
window.onclick = function(event) {
  const modal = document.getElementById("ayudaModal");
  if (event.target === modal) {
    modal.style.display = "none";
  }
}

function mostrarInfoGraficas() {
  document.getElementById("infoGraficasPopup").style.display = "block";
}
function cerrarInfoGraficas() {
  document.getElementById("infoGraficasPopup").style.display = "none";
}

