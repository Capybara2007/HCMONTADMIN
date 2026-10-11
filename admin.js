```javascript
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

// Prikaz poruka
function message(id, text, type = "") {
  const element = $(id);
  if (!element) return;

  element.textContent = text;
  element.className = "message " + type;
}

// Zaštita teksta koji se prikazuje na stranici
function escapeHTML(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[c]);
}

// Formatiranje datuma
function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return new Intl.DateTimeFormat("sr-RS", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

// Boja statusa
function statusClass(status) {
  if (status === "Na čekanju") return "pending";
  if (status === "Potvrđen") return "confirmed";
  if (status === "Završen") return "finished";
  return "rejected";
}

// Statistika termina
function updateStats() {
  $("pendingCount").textContent =
    appointments.filter(a => a.status === "Na čekanju").length;

  $("confirmedCount").textContent =
    appointments.filter(a => a.status === "Potvrđen").length;

  $("finishedCount").textContent =
    appointments.filter(a => a.status === "Završen").length;
}

// Prikaz termina
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
            <p>
              ${escapeHTML(a.usluga)} ·
              ${escapeHTML(formatDate(a.datum_termina))}
            </p>
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
            ${escapeHTML(
              a.detalji || "Nema dodatnih informacija"
            )}
          </p>
        </div>

        ${actions ? `<div class="actions">${actions}</div>` : ""}
      </article>`;
  }).join("");
}

// Učitavanje termina iz Supabase baze
async function loadAppointments() {
  $("refreshBtn").disabled = true;
  message("dashboardMessage", "Učitavanje termina...");

  try {
    const { data, error } = await db
      .from("termini")
      .select(`
        id,
        ime_klijenta,
        email,
        telefon,
        adresa,
        usluga,
        datum_termina,
        status,
        detalji
      `)
      .order("datum_termina", { ascending: true });

    if (error) throw error;

    appointments = data || [];

    updateStats();
    renderAppointments();

    message(
      "dashboardMessage",
      "Termini su osveženi.",
      "success"
    );
  } catch (error) {
    console.error("Greška pri učitavanju termina:", error);

    message(
      "dashboardMessage",
      "Greška pri učitavanju. Proveri RLS pravila i dozvole.",
      "error"
    );

    $("appointments").innerHTML = "";
  } finally {
    $("refreshBtn").disabled = false;
  }
}

// Promena statusa termina
async function changeStatus(id, status) {
  const questions = {
    "Potvrđen": "Da li želiš da potvrdiš ovaj termin?",
    "Odbijen": "Da li želiš da odbiješ ovaj zahtev?",
    "Završen": "Da li je posao završen?"
  };

  if (!questions[status]) return;

  if (!confirm(questions[status])) return;

  const changes = { status };

  // Čuvanje datuma završetka posla
  if (status === "Završen") {
    changes.datum_zavrsetka = new Date().toISOString();
  }

  message("dashboardMessage", "Čuvanje promene...");

  const { error } = await db
    .from("termini")
    .update(changes)
    .eq("id", id);

  if (error) {
    console.error("Greška pri promeni statusa:", error);

    message(
      "dashboardMessage",
      "Promena nije uspela. Proveri UPDATE dozvolu i RLS pravila.",
      "error"
    );

    return;
  }

  // Osvežavanje prikaza
  await loadAppointments();

  // Mejl se šalje kod potvrde ili odbijanja
  if (status === "Potvrđen" || status === "Odbijen") {
    message(
      "dashboardMessage",
      "Status je promenjen. Pokušavam da pošaljem mejl..."
    );

    try {
      const {
        data: { session },
        error: sessionError
      } = await db.auth.getSession();

      if (sessionError) throw sessionError;

      if (!session) {
        throw new Error("Nema aktivne prijave.");
      }

      const { data, error: mailError } =
        await db.functions.invoke("posalji-email", {
          body: {
            id: Number(id),
            status: status
          }
        });

      if (mailError) throw mailError;

      if (data?.error) {
        throw new Error(data.error);
      }

      message(
        "dashboardMessage",
        "Status je promenjen. Funkcija za slanje mejla je uspešno odgovorila.",
        "success"
      );
    } catch (error) {
      console.error("Greška pri slanju mejla:", error);

      message(
        "dashboardMessage",
        "Status je sačuvan, ali slanje mejla nije uspelo. Proveri Edge Function i Resend.",
        "error"
      );
    }

    return;
  }

  if (status === "Završen") {
    message(
      "dashboardMessage",
      "Posao je označen kao završen i datum završetka je sačuvan.",
      "success"
    );
  } else {
    message(
      "dashboardMessage",
      "Termin je odbijen.",
      "success"
    );
  }
}

// Provera prijave i prikaz panela
async function showDashboard() {
  const { data, error } = await db.auth.getSession();

  if (error) {
    console.error("Greška pri proveri prijave:", error);

    message(
      "loginMessage",
      "Greška pri proveri prijave.",
      "error"
    );

    return;
  }

  const session = data.session;

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

// Prijavljivanje administratora
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

  try {
    const { error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) throw error;

    await showDashboard();
  } catch (error) {
    console.error("Greška pri prijavi:", error);

    message(
      "loginMessage",
      "Prijava nije uspela. Proveri email i lozinku u Supabase-u.",
      "error"
    );
  } finally {
    $("loginBtn").disabled = false;
  }
});

// Odjavljivanje administratora
$("logoutBtn").addEventListener("click", async () => {
  const { error } = await db.auth.signOut();

  if (error) {
    console.error("Greška pri odjavljivanju:", error);

    message(
      "dashboardMessage",
      "Odjavljivanje nije uspelo.",
      "error"
    );

    return;
  }

  appointments = [];

  await showDashboard();
});

// Ručno osvežavanje
$("refreshBtn").addEventListener("click", loadAppointments);

// Filtriranje po statusu
$("statusFilter").addEventListener("change", renderAppointments);

// Klik na dugmad za promenu statusa
$("appointments").addEventListener("click", async event => {
  const button = event.target.closest("button[data-status]");

  if (!button) return;

  button.disabled = true;

  try {
    await changeStatus(
      button.dataset.id,
      button.dataset.status
    );
  } catch (error) {
    console.error("Greška pri obradi termina:", error);

    message(
      "dashboardMessage",
      "Došlo je do neočekivane greške.",
      "error"
    );
  } finally {
    button.disabled = false;
  }
});

// Pokretanje panela
showDashboard();
```
