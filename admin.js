```javascript
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

  // Osvežavanje termina — originalna funkcionalnost ostaje
  await loadAppointments();

  // Dodatak: slanje mejla nakon potvrde ili odbijanja
  if (status === "Potvrđen" || status === "Odbijen") {
    message(
      "dashboardMessage",
      "Status je promenjen. Šalje se mejl..."
    );

    const { data, error: mailError } =
      await db.functions.invoke("posalji-email", {
        body: {
          id: Number(id),
          status: status
        }
      });

    if (mailError || data?.error) {
      console.error(
        "Greška pri slanju mejla:",
        mailError || data
      );

      message(
        "dashboardMessage",
        "Status je promenjen, ali slanje mejla nije uspelo.",
        "error"
      );
      return;
    }

    message(
      "dashboardMessage",
      "Status je promenjen i zahtev za slanje mejla je obrađen.",
      "success"
    );

    return;
  }

  // Originalna poruka za završen posao
  message(
    "dashboardMessage",
    "Status je promenjen: " + status,
    "success"
  );
}
```
