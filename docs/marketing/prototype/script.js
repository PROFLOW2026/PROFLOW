/**
 * ProjectFlow landing prototype — isolated interactions only.
 * No analytics, no auth, no backend.
 */
(function () {
  "use strict";

  var SIGN_UP = "/he-IL/sign-up";

  /* ——— Review mode (dev helper, off by default) ——— */
  var reviewBtn = document.getElementById("review-toggle");
  if (reviewBtn) {
    var params = new URLSearchParams(window.location.search);
    if (params.get("review") === "1") {
      document.body.classList.add("review-mode");
      reviewBtn.setAttribute("aria-pressed", "true");
      reviewBtn.textContent = "Review ON";
    }
    reviewBtn.addEventListener("click", function () {
      var on = document.body.classList.toggle("review-mode");
      reviewBtn.setAttribute("aria-pressed", on ? "true" : "false");
      reviewBtn.textContent = on ? "Review ON" : "Review";
      try {
        var url = new URL(window.location.href);
        if (on) url.searchParams.set("review", "1");
        else url.searchParams.delete("review");
        history.replaceState(null, "", url);
      } catch (_) {}
    });
  }

  /* ——— Smooth scroll for in-page anchors ——— */
  document.querySelectorAll('a[href^="#"]').forEach(function (link) {
    link.addEventListener("click", function (e) {
      var id = link.getAttribute("href");
      if (!id || id === "#") return;
      var target = document.querySelector(id);
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: "smooth", block: "start" });
      if (history.pushState) {
        history.pushState(null, "", id);
      }
    });
  });

  /* ——— Product tour tabs (desktop) ——— */
  var tabs = document.querySelectorAll('[role="tab"][data-tour-tab]');
  var panels = document.querySelectorAll('[role="tabpanel"][data-tour-panel]');

  function activateTour(id) {
    tabs.forEach(function (tab) {
      var selected = tab.getAttribute("data-tour-tab") === id;
      tab.setAttribute("aria-selected", selected ? "true" : "false");
      tab.tabIndex = selected ? 0 : -1;
    });
    panels.forEach(function (panel) {
      var match = panel.getAttribute("data-tour-panel") === id;
      panel.classList.toggle("is-active", match);
      panel.hidden = !match;
    });
  }

  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      activateTour(tab.getAttribute("data-tour-tab"));
    });
    tab.addEventListener("keydown", function (e) {
      var list = Array.prototype.slice.call(tabs);
      var i = list.indexOf(tab);
      var next = null;
      if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
        next = list[(i + 1) % list.length];
      } else if (e.key === "ArrowRight" || e.key === "ArrowUp") {
        next = list[(i - 1 + list.length) % list.length];
      } else if (e.key === "Home") {
        next = list[0];
      } else if (e.key === "End") {
        next = list[list.length - 1];
      }
      if (next) {
        e.preventDefault();
        next.focus();
        activateTour(next.getAttribute("data-tour-tab"));
      }
    });
  });

  if (tabs.length) activateTour(tabs[0].getAttribute("data-tour-tab"));

  /* ——— FAQ accordion ——— */
  document.querySelectorAll(".faq-item").forEach(function (item) {
    var trigger = item.querySelector(".faq-item__trigger");
    var panel = item.querySelector(".faq-item__panel");
    if (!trigger || !panel) return;

    trigger.setAttribute("aria-expanded", "false");
    panel.id = panel.id || "faq-panel-" + Math.random().toString(36).slice(2, 8);
    trigger.setAttribute("aria-controls", panel.id);

    trigger.addEventListener("click", function () {
      var open = item.classList.toggle("is-open");
      trigger.setAttribute("aria-expanded", open ? "true" : "false");
    });

    trigger.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        trigger.click();
      }
    });
  });

  /* ——— Sticky mobile CTA after hero ——— */
  var sticky = document.getElementById("sticky-cta");
  var hero = document.getElementById("hero");
  var finalCta = document.getElementById("final-cta");

  if (sticky && hero && "IntersectionObserver" in window) {
    var heroOut = false;
    var nearEnd = false;

    function syncSticky() {
      var show = heroOut && !nearEnd && window.matchMedia("(max-width: 767px)").matches;
      sticky.classList.toggle("is-visible", show);
      sticky.classList.toggle("is-hidden-near-end", nearEnd);
      sticky.setAttribute("aria-hidden", show ? "false" : "true");
      document.body.classList.toggle("sticky-active", show);
      document.body.classList.toggle("has-sticky-cta", true);
    }

    var heroObs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          heroOut = !entry.isIntersecting;
          syncSticky();
        });
      },
      { threshold: 0.05 }
    );
    heroObs.observe(hero);

    if (finalCta) {
      var endObs = new IntersectionObserver(
        function (entries) {
          entries.forEach(function (entry) {
            nearEnd = entry.isIntersecting;
            syncSticky();
          });
        },
        { threshold: 0.15 }
      );
      endObs.observe(finalCta);
    }

    window.addEventListener("resize", syncSticky);
  }

  /* ——— Subtle section reveal ——— */
  if ("IntersectionObserver" in window && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    var reveals = document.querySelectorAll(".reveal");
    var revObs = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-inview");
            revObs.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -40px 0px" }
    );
    reveals.forEach(function (el) {
      revObs.observe(el);
    });
  } else {
    document.querySelectorAll(".reveal").forEach(function (el) {
      el.classList.add("is-inview");
    });
  }

  /* Expose sign-up path constant for sanity (CTAs already link in HTML) */
  window.PF_PROTOTYPE = { signUp: SIGN_UP };
})();
