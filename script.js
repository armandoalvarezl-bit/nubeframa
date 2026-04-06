const contactForm = document.getElementById("contactForm");
const formFeedback = document.getElementById("formFeedback");

if (contactForm && formFeedback) {
  contactForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const nameField = document.getElementById("nombre");
    const solutionField = document.getElementById("tipo");
    const name = nameField ? nameField.value.trim() : "";
    const solution = solutionField ? solutionField.value : "la solución seleccionada";

    formFeedback.textContent = name
      ? `Gracias, ${name}. Tu solicitud sobre ${solution.toLowerCase()} fue registrada.`
      : "Tu solicitud fue registrada correctamente.";

    contactForm.reset();
  });
}

const revealItems = document.querySelectorAll(".reveal-up");

if ("IntersectionObserver" in window && revealItems.length > 0) {
  const revealObserver = new IntersectionObserver(
    (entries, observer) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }

        entry.target.classList.add("is-visible");
        observer.unobserve(entry.target);
      });
    },
    {
      threshold: 0.18,
    }
  );

  revealItems.forEach((item) => revealObserver.observe(item));
} else {
  revealItems.forEach((item) => item.classList.add("is-visible"));
}
