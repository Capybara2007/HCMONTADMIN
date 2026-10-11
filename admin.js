
const SUPABASE_URL = "https://iijebacrroyhazwclgtg.supabase.co";
const SUPABASE_KEY = "sb_publishable_WME-nAIH0HpaEzmziyJVGw_qmnU4XVs";

const ADMIN_EMAIL = "adminhcmont@gmail.com";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

const $ = id => document.getElementById(id);

$("year").textContent = new Date().getFullYear();

let appointments = [];

function message(id, text, type = "") {
  $(id).textContent = text;
  $(id).className = "message " + type;
}

function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

function formatDate(value) {
  if (!value) return "—";

  return new Intl.DateTimeFormat("sr-RS", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function statusClass(status) {
  if (status === "Na čekanju") return "pending";
  if (status === "Potvrđen") return "confirmed";
  if (status === "Završen") return "finished";
  return "rejected";
}

function updateStats() {
  $("pendingCount").textContent =
    appointments.filter(a => a.status === "Na čekanju").length;

  $("confirmedCount").textContent =
    appointments.filter(a => a.status === "Potvrđen").length;

  $("finishedCount").textContent =
    appointments.filter(a => a.status === "Završen").length;
}

function renderAppointments() {
  const filter = $("statusFilter").value;

  const list = filter === "svi"
    ? appointments
    : appointments.filter(a => a.status === filter);

  if (!list.length) {
    $("appointments").innerHTML =
      '<div class="empty">Nema termina za prikaz.</div>';
    return;
  }

  $("appointments").innerHTML = list.map(a => {
    let actions = "";

    if (a.status === "Na čekanju") {
      actions = `
        <button class="action confirm-btn"
          data-status="Potvrđen" data-id="${a.id}">
          ✓ Potvrdi
        </button>
        <button class="action reject-btn"
          data-status="Odbijen" data-id="${a.id}">
          ✕ Odbij
        </button>`;
    }

    if (a.status === "Potvrđen") {
      actions = `
        <button class="action finish-btn"
          data-status="Završen" data-id="${a.id}">
          ✓ Završi posao
        </button>
        <button class="action reject-btn"
          data-status="Odbijen" data-id="${a.id}">
          ✕ Odbij
        </button>`;
    }

    return `
      <article class="appointment">
        <div class="appointment-top">
          <div>
            <h2>${escapeHTML(a.ime_klijenta)}</h2>
            <p>${escapeHTML(a.usluga)} ·
              ${escapeHTML(formatDate(a.datum_termina))}</p>
          </div>
          <span class="status ${statusClass(a.status)}">
            ${escapeHTML(a.status)}
          </span>
        </div>

        <div class="details">
          <p><b>Telefon:</b> ${escapeHTML(a.telefon)}</p>
          <p><b>Imejl:</b> ${escapeHTML(a.email)}</p>
          <p><b>Adresa:</b> ${escapeHTML(a.adresa)}</p>
          <p><b>Detalji:</b>
            ${escapeHTML(a.detalji || "Nema dodatnih informacija")}</p>
        </div>

        ${actions ? `<div class="actions">${actions}</div>` : ""}
      </article>`;
  }).join("");
}

async function loadAppointments() {
  $("refreshBtn").disabled = true;
  message("dashboardMessage", "Učitavanje termina...");

  const { data, error } = await db
    .from("termini")
    .select(`
      id, ime_klijenta, email, telefon, adresa,
      usluga, datum_termina, status, detalji
    `)
    .order("datum_termina", { ascending: true });

  $("refreshBtn").disabled = false;

  if (error) {
    console.error(error);
    message(
      "dashboardMessage",
      "Greška pri učitavanju. Proveri RLS pravila i dozvole.",
      "error"
    );
    $("appointments").innerHTML = "";
    return;
  }

  appointments = data || [];
  updateStats();
  renderAppointments();

  message("dashboardMessage", "Termini su osveženi.", "success");
}

async function changeStatus(id, status) {
  const questions = {
    "Potvrđen": "Da li želiš da potvrdiš ovaj termin?",
    "Odbijen": "Da li želiš da odbiješ ovaj zahtev?",
    "Završen": "Da li je posao završen?"
  };

  if (!confirm(questions[status])) return;

  const changes = { status };

  if (status === "Završen") {
    changes.datum_zavrsetka = new Date().toISOString();
  }

  const { error } = await db
    .from("termini")
    .update(changes)
    .eq("id", id);

  if (error) {
    console.error(error);
    message(
      "dashboardMessage",
      "Promena nije uspela. Proveri UPDATE dozvolu i RLS pravila.",
      "error"
    );
    return;
  }

  message("dashboardMessage", "Status je promenjen: " + status, "success");
  await loadAppointments();
}

async function showDashboard() {
  const { data: { session }, error } = await db.auth.getSession();

  if (error) {
    console.error(error);
    message("loginMessage", "Greška pri proveri prijave.", "error");
    return;
  }

  if (!session || session.user.email !== ADMIN_EMAIL) {
    if (session) {
      await db.auth.signOut();
    }

    $("loginSection").classList.remove("hidden");
    $("dashboard").classList.add("hidden");
    $("logoutBtn").classList.add("hidden");
    return;
  }

  $("loginSection").classList.add("hidden");
  $("dashboard").classList.remove("hidden");
  $("logoutBtn").classList.remove("hidden");

  await loadAppointments();
}

$("loginForm").addEventListener("submit", async event => {
  event.preventDefault();

  $("loginBtn").disabled = true;
  message("loginMessage", "Prijavljivanje...");

  const email = $("loginEmail").value.trim().toLowerCase();
  const password = $("loginPassword").value;

  if (email !== ADMIN_EMAIL) {
    message(
      "loginMessage",
      "Ovaj email nema pristup admin panelu.",
      "error"
    );
    $("loginBtn").disabled = false;
    return;
  }

  const { error } = await db.auth.signInWithPassword({
    email,
    password
  });

  $("loginBtn").disabled = false;

  if (error) {
    message(
      "loginMessage",
      "Prijava nije uspela. Proveri email i lozinku u Supabase-u.",
      "error"
    );
    console.error(error);
    return;
  }

  await showDashboard();
});

$("logoutBtn").addEventListener("c
async function changeStatus(id, status) {
  const questions = {
    "Potvrđen": "Da li želiš da potvrdiš ovaj termin?",
    "Odbijen": "Da li želiš da odbiješ ovaj zahtev?",
    "Završen": "Da li je posao završen?"
  };

  if (!confirm(questions[status])) return;

  const changes = { status };

  if (status === "Završen") {
    changes.datum_zavrsetka = new Date().toISOString();
  }

  const { error } = await db
    .from("termini")
    .update(changes)
    .eq("id", id);

  if (error) {
    console.error(error);
    message(
      "dashboardMessage",
      "Promena nije uspela. Proveri dozvole i RLS pravila.",
      "error"
    );
    return;
  }

  // Osvežavamo podatke jer je status već promenjen.
  await loadAppointments();

  // Mejl se šalje samo kod potvrde ili odbijanja.
  if (status === "Potvrđen" || status === "Odbijen") {
    message("dashboardMessage", "Status je promenjen. Šalje se mejl...");

    const { data: { session } } = await db.auth.getSession();

    if (!session) {
      message(
        "dashboardMessage",
        "Status je promenjen, ali nema aktivne prijave za slanje mejla.",
        "error"
      );
      return;
    }

    const { data, error: mailError } = await db.functions.invoke(
      "posalji-email",
      {
        body: {
          id: Number(id),
          status: status
        }
      }
    );

    if (mailError || data?.error) {
      console.error("Greška pri slanju mejla:", mailError || data);

      message(
        "dashboardMessage",
        "Status je promenjen, ali mejl nije potvrđeno poslat. Proveri Edge Function i Resend.",
        "error"
      );
      return;
    }

    message(
      "dashboardMessage",
      "Status je promenjen i zahtev za slanje mejla je uspešno obrađen.",
      "success"
    );

    return;
  }

  message(
    "dashboardMessage",
    "Posao je označen kao završen. Datum završetka je sačuvan.",
    "success"
  );
}lick", async () => {
  await db.auth.signOut();
  appointments = [];
  await showDashboard();
});

$("refreshBtn").addEventListener("click", loadAppointments);
$("statusFilter").addEventListener("change", renderAppointments);

$("appointments").addEventListener("click", async event => {
  const button = event.target.closest("button[data-status]");
  if (!button) return;

  button.disabled = true;

  try {
    await changeStatus(button.dataset.id, button.dataset.status);
  } finally {
    button.disabled = false;
  }
});

showDashboard();
