(() => {
  'use strict';

  /* ======================================================
     EDIT THESE: your name and your own profile links
     ====================================================== */
  const AUTHOR = 'Your Name';
  const LINKS = {
    github: 'https://github.com/',
    linkedin: 'https://www.linkedin.com/',
    instagram: 'https://www.instagram.com/',
    email: 'support@example.com'
  };

  /* ================= Helpers ================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const app = $('#app');

  const CATEGORIES = ['Mobile', 'Laptop', 'Television', 'Home Appliance', 'Kitchen Appliance', 'Audio', 'Camera', 'Other'];
  const STATUS_LABEL = { active: 'Active', expiring: 'Expiring soon', expired: 'Expired' };

  const store = {
    get(key, fallback) {
      try {
        const v = JSON.parse(localStorage.getItem(key));
        return v === null ? fallback : v;
      } catch (e) { return fallback; }
    },
    set(key, val) {
      try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* storage blocked */ }
    }
  };

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const LOGO = (size = 40) => `
    <svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true">
      <path d="M32 3L55 11v17c0 15-9 27-23 33C18 55 9 43 9 28V11z" fill="#0f766e"/>
      <path d="M32 3L55 11v17c0 15-9 27-23 33z" fill="#14b8a6" opacity=".55"/>
      <path d="M21 32l8 8 15-17" fill="none" stroke="#f5b83d" stroke-width="6" stroke-linecap="round" stroke-linejoin="round"/>
    </svg>`;

  const ICON = {
    search: '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
    shield: '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2l8 3v6c0 5-3.4 9.3-8 11-4.6-1.7-8-6-8-11V5z"/><path d="M8.5 12l2.5 2.5L16 9.5"/></svg>',
    plus: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>'
  };

  /* ================= Preferences (language / currency / country) ================= */
  /* Prices are always saved in INR. The currency switch only changes how they are
     displayed, using these fixed APPROXIMATE rates (edit them if you like). */
  const CURRENCIES = {
    INR: { name: 'Indian Rupee', rate: 1, locale: 'en-IN' },
    USD: { name: 'US Dollar', rate: 0.012, locale: 'en-US' },
    EUR: { name: 'Euro', rate: 0.011, locale: 'de-DE' }
  };
  const LANGUAGES = ['English'];
  const COUNTRIES = ['India', 'United States', 'United Kingdom', 'United Arab Emirates'];
  const PREFS = 'wdp_prefs';
  const getPrefs = () => Object.assign({ lang: 'English', cur: 'INR', country: 'India' }, store.get(PREFS, {}));
  const setPref = (k, v) => store.set(PREFS, Object.assign(getPrefs(), { [k]: v }));

  function money(inr) {
    const p = getPrefs();
    const c = CURRENCIES[p.cur] || CURRENCIES.INR;
    return new Intl.NumberFormat(c.locale, {
      style: 'currency', currency: p.cur in CURRENCIES ? p.cur : 'INR',
      maximumFractionDigits: p.cur === 'INR' ? 0 : 2
    }).format(Number(inr) * c.rate);
  }

  /* ================= State ================= */
  const defaultUI = () => ({ q: '', cat: 'All', status: 'all', sort: 'new' });
  let ui = defaultUI();
  let keepUI = false;
  let liveDraw = null;
  let currentView = '';

  /* ================= Data layer ================= */
  const USERS = 'wdp_users';
  const SESSION = 'wdp_session';
  const cardsKey = email => 'wdp_cards_' + email;

  const getUsers = () => store.get(USERS, []);
  const getSession = () => store.get(SESSION, null);
  const getCards = () => { const u = getSession(); return u ? store.get(cardsKey(u.email), []) : []; };
  const setCards = list => { const u = getSession(); if (u) store.set(cardsKey(u.email), list); };

  /* ================= Date & warranty logic ================= */
  function addMonths(dateStr, months) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const base = new Date(y, m - 1 + Number(months), 1);
    const lastDay = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate();
    base.setDate(Math.min(d, lastDay));
    return base;
  }
  const startOf = c => { const [y, m, d] = c.purchaseDate.split('-').map(Number); return new Date(y, m - 1, d); };
  const expiryOf = c => addMonths(c.purchaseDate, c.months);
  const today0 = () => { const t = new Date(); t.setHours(0, 0, 0, 0); return t; };
  const daysLeft = c => Math.round((expiryOf(c) - today0()) / 86400000);

  function statusOf(c) {
    const d = daysLeft(c);
    if (d < 0) return { key: 'expired', label: 'Expired', text: `Expired ${Math.abs(d)} day${Math.abs(d) === 1 ? '' : 's'} ago` };
    if (d <= 30) return { key: 'expiring', label: 'Expiring soon', text: d === 0 ? 'Expires today' : `${d} day${d === 1 ? '' : 's'} left` };
    return { key: 'active', label: 'Active', text: `${d} days left` };
  }
  function remainingPct(c) {
    const total = expiryOf(c) - startOf(c);
    const left = expiryOf(c) - today0();
    if (total <= 0) return 0;
    return Math.max(0, Math.min(100, Math.round((left / total) * 100)));
  }
  const fmt = d => new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  const isoToday = () => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  };

  /* ================= Toast, modal, drawer ================= */
  let toastTimer;
  function toast(text) {
    const t = $('#toast');
    t.textContent = text;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
  }

  function openModal(html) {
    const m = $('#modal');
    m.innerHTML = `<div class="modal-box" role="dialog" aria-modal="true"><button class="modal-x" aria-label="Close">&times;</button>${html}</div>`;
    m.classList.add('open');
    m.setAttribute('aria-hidden', 'false');
  }
  function closeModal() {
    const m = $('#modal');
    m.classList.remove('open');
    m.setAttribute('aria-hidden', 'true');
    m.innerHTML = '';
  }
  $('#modal').addEventListener('click', e => {
    if (e.target.id === 'modal' || e.target.closest('.modal-x')) closeModal();
  });

  function openDrawer() {
    const d = $('#drawer'), o = $('#dOverlay');
    if (!d || !o) return;
    d.classList.add('open');
    o.classList.add('open');
    document.body.classList.add('lock');
  }
  function closeDrawer() {
    const d = $('#drawer'), o = $('#dOverlay');
    if (d) d.classList.remove('open');
    if (o) o.classList.remove('open');
    document.body.classList.remove('lock');
  }
  function toggleAcct() {
    const a = $('#acct');
    if (!a) return;
    const open = a.classList.toggle('open');
    $('.acct-btn', a).setAttribute('aria-expanded', open);
  }
  function closeAcct() {
    const a = $('#acct');
    if (!a) return;
    a.classList.remove('open');
    const b = $('.acct-btn', a);
    if (b) b.setAttribute('aria-expanded', 'false');
  }

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeModal(); closeDrawer(); closeAcct(); }
  });

  /* ================= Info pages (footer / help links) ================= */
  const INFO = {
    about: ['About Us', `
      <p><b>Digital Warranty Card</b> is a Web Development Project (WDP) built with HTML, CSS and JavaScript.</p>
      <p>It helps you keep every product warranty in one secure place, so you never have to search for paper bills again.</p>
      <ul>
        <li>Save unlimited warranty cards</li>
        <li>Automatic expiry date calculation</li>
        <li>Status tracking: Active, Expiring soon, Expired</li>
        <li>Search, filter and sort in one click</li>
      </ul>`],
    how: ['How it works', `
      <ol>
        <li>Create your free account and login.</li>
        <li>Open <b>Add Warranty</b> and enter the product details, purchase date and warranty period.</li>
        <li>The expiry date is calculated automatically and the card is saved.</li>
        <li>Open <b>My Warranties</b> to search, filter and view every card.</li>
      </ol>`],
    features: ['Our Features', `
      <ul>
        <li>Secure login and create account</li>
        <li>Beautiful warranty cards with progress bar</li>
        <li>Live search from the header</li>
        <li>Category, status and sort filters</li>
        <li>Expiry alerts for the next 30 days</li>
        <li>Currency display switch (INR, USD, EUR)</li>
        <li>Works on mobile, tablet and desktop</li>
      </ul>`],
    privacy: ['Privacy Policy', `
      <p>Your privacy matters. This website stores your account and warranty data <b>only in your own browser</b> (localStorage).</p>
      <ul>
        <li>No data is sent to any server.</li>
        <li>No cookies are used for tracking or advertising.</li>
        <li>Clearing your browser data removes all saved information.</li>
      </ul>
      <p>Note: this is a college project, so please do not use a password that you use anywhere else.</p>`],
    terms: ['Conditions of Use', `
      <ul>
        <li>This website is created for learning and demonstration purposes.</li>
        <li>You are responsible for the accuracy of the information you enter.</li>
        <li>Warranty dates shown are calculated from your input and are not an official guarantee.</li>
        <li>Data is stored in your browser and can be lost if you clear it.</li>
      </ul>`],
    choices: ['Your Data Choices', `
      <p>You are in full control of your data.</p>
      <ul>
        <li>All information stays inside your browser.</li>
        <li>To remove everything, clear this site's data from your browser settings.</li>
        <li>Logging out removes your session but keeps your saved warranty cards.</li>
      </ul>`],
    help: ['Help Center', `
      <details><summary>How is the expiry date calculated?</summary><p>Expiry date = purchase date + warranty period in months.</p></details>
      <details><summary>What does "Expiring soon" mean?</summary><p>A warranty that will end within the next 30 days.</p></details>
      <details><summary>Why can't I add the same serial number twice?</summary><p>Each product has a unique serial number, so duplicates are blocked to avoid mistakes.</p></details>
      <details><summary>Can I see my data on another device?</summary><p>No. Data is stored in this browser only, so it will not appear on other devices.</p></details>
      <details><summary>How do I search my warranties?</summary><p>Use the search bar at the top. Pick a category on the left of the bar to narrow down the results.</p></details>
      <details><summary>How do I change the currency?</summary><p>Use the currency button in the footer. Prices are saved in rupees and converted for display only.</p></details>`],
    contact: ['Contact Us', `
      <p>Have a question or feedback about this project? Reach out:</p>
      <dl class="kv">
        <dt>Developer</dt><dd>${esc(AUTHOR)}</dd>
        <dt>Email</dt><dd><a class="lnk" href="mailto:${esc(LINKS.email)}">${esc(LINKS.email)}</a></dd>
        <dt>GitHub</dt><dd><a class="lnk" href="${esc(LINKS.github)}" target="_blank" rel="noopener">${esc(LINKS.github)}</a></dd>
        <dt>LinkedIn</dt><dd><a class="lnk" href="${esc(LINKS.linkedin)}" target="_blank" rel="noopener">${esc(LINKS.linkedin)}</a></dd>
      </dl>
      <p class="muted">We usually reply within 24 hours.</p>`],
    feedback: ['Send Feedback', `
      <p>We would love to hear your ideas to make this project better.</p>
      <p>Please send your feedback to <a class="lnk" href="mailto:${esc(LINKS.email)}?subject=Digital%20Warranty%20Card%20Feedback">${esc(LINKS.email)}</a>.</p>`]
  };

  function openInfo(key) {
    closeDrawer();
    let title, body;
    if (key === 'account') {
      const u = getSession();
      title = 'Your Account';
      body = u
        ? `<dl class="kv"><dt>Name</dt><dd>${esc(u.name)}</dd><dt>Email</dt><dd>${esc(u.email)}</dd><dt>Saved warranties</dt><dd>${getCards().length}</dd></dl>
           <a class="btn sm" href="#/logout">Logout</a>`
        : '<p>Please login to see your account details.</p>';
    } else if (INFO[key]) {
      [title, body] = INFO[key];
    } else return;
    openModal(`<div class="info-head">${LOGO(32)}<h3>${title}</h3></div><div class="info-body">${body}</div>`);
  }

  /* ================= Preference popups (footer selectors) ================= */
  function openPrefs(kind) {
    const p = getPrefs();
    let title, items, note = '';
    if (kind === 'lang') {
      title = 'Choose a language';
      items = LANGUAGES.map(l => ({ v: l, label: l, sel: p.lang === l }));
      note = 'Your language choice is saved. The full website text is currently available in English only.';
    } else if (kind === 'cur') {
      title = 'Choose a currency';
      items = Object.keys(CURRENCIES).map(c => ({ v: c, label: `${c} - ${CURRENCIES[c].name}`, sel: p.cur === c }));
      note = 'Prices are saved in rupees (INR). Other currencies are shown using fixed approximate rates, not live rates.';
    } else {
      title = 'Choose your country';
      items = COUNTRIES.map(c => ({ v: c, label: c, sel: p.country === c }));
      note = 'Your country choice is saved on this device.';
    }
    openModal(`
      <div class="info-head">${LOGO(32)}<h3>${title}</h3></div>
      <div class="info-body">
        <div class="opts">
          ${items.map(i => `
            <button type="button" class="opt ${i.sel ? 'sel' : ''}" data-act="setpref" data-val="${kind}:${esc(i.v)}">
              <span>${esc(i.label)}</span>${i.sel ? '<span class="tick-s">&#10003;</span>' : ''}
            </button>`).join('')}
        </div>
        <p class="note">${note}</p>
      </div>`);
  }

  function applyPref(val) {
    const idx = val.indexOf(':');
    const kind = val.slice(0, idx), value = val.slice(idx + 1);
    if (kind === 'lang') { setPref('lang', value); toast(`Language set to ${value}`); }
    if (kind === 'cur') { setPref('cur', value); toast(`Prices are now shown in ${value}`); }
    if (kind === 'country') { setPref('country', value); toast(`Country set to ${value}`); }
    closeModal();
    keepUI = true;
    router();
  }

  /* ================= Navigation helper ================= */
  function goWarranties(opts = {}) {
    ui = Object.assign(defaultUI(), opts);
    keepUI = true;
    if (location.hash === '#/warranties') router(); else location.hash = '#/warranties';
  }

  /* ================= Global click handling ================= */
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    const act = el && el.dataset.act;
    if (act !== 'acct') closeAcct();
    if (!el) return;
    if (el.tagName === 'A') e.preventDefault();
    const val = el.dataset.val;

    switch (act) {
      case 'status': goWarranties({ status: val }); break;
      case 'cat': goWarranties({ cat: val }); break;
      case 'info': openInfo(val); break;
      case 'pref': openPrefs(val); break;
      case 'setpref': applyPref(val); break;
      case 'top': window.scrollTo({ top: 0, behavior: 'smooth' }); break;
      case 'drawer': openDrawer(); break;
      case 'drawer-close': closeDrawer(); break;
      case 'acct': toggleAcct(); break;
    }
  });

  /* ================= Layout: footer (Amazon style) ================= */
  function siteFooter() {
    const yr = new Date().getFullYear();
    const p = getPrefs();

    const directory = [
      { t: 'Mobile Warranty', d: 'Phones, tablets and accessories', act: 'cat', val: 'Mobile' },
      { t: 'Laptop Warranty', d: 'Laptops, PCs and peripherals', act: 'cat', val: 'Laptop' },
      { t: 'Television', d: 'Smart TVs and displays', act: 'cat', val: 'Television' },
      { t: 'Home Appliances', d: 'Fridge, AC and washing machine', act: 'cat', val: 'Home Appliance' },
      { t: 'Kitchen Appliances', d: 'Mixers, ovens and chimneys', act: 'cat', val: 'Kitchen Appliance' },
      { t: 'Audio', d: 'Headphones, speakers and soundbars', act: 'cat', val: 'Audio' },
      { t: 'Camera', d: 'Cameras, lenses and drones', act: 'cat', val: 'Camera' },
      { t: 'Active Warranties', d: 'Products that are covered today', act: 'status', val: 'active' },
      { t: 'Expiring Soon', d: 'Coverage ending in 30 days', act: 'status', val: 'expiring' },
      { t: 'Expired Records', d: 'Past coverage at a glance', act: 'status', val: 'expired' },
      { t: 'Add Warranty', d: 'Create a new card in seconds', href: '#/add' },
      { t: 'Your Account', d: 'View your profile details', act: 'info', val: 'account' },
      { t: 'Help Center', d: 'Answers to common questions', act: 'info', val: 'help' },
      { t: 'About the Project', d: 'Built with HTML, CSS and JS', act: 'info', val: 'about' },
      { t: 'Contact Us', d: 'Questions, ideas and feedback', act: 'info', val: 'contact' }
    ].map(i => i.href
      ? `<a href="${i.href}"><b>${i.t}</b><small>${i.d}</small></a>`
      : `<button type="button" data-act="${i.act}" data-val="${i.val}"><b>${i.t}</b><small>${i.d}</small></button>`
    ).join('');

    return `
      <footer class="site-footer">
        <button class="to-top" type="button" data-act="top">Back to top</button>

        <div class="f-main">
          <div class="f-grid">
            <div class="f-col">
              <h4>Get to Know Us</h4>
              <button type="button" data-act="info" data-val="about">About Us</button>
              <button type="button" data-act="info" data-val="how">How it works</button>
              <button type="button" data-act="info" data-val="features">Our Features</button>
              <button type="button" data-act="info" data-val="privacy">Privacy Policy</button>
              <button type="button" data-act="info" data-val="terms">Conditions of Use</button>
            </div>
            <div class="f-col">
              <h4>Connect with Us</h4>
              <a href="${esc(LINKS.github)}" target="_blank" rel="noopener">GitHub</a>
              <a href="${esc(LINKS.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>
              <a href="${esc(LINKS.instagram)}" target="_blank" rel="noopener">Instagram</a>
              <a href="mailto:${esc(LINKS.email)}">Email Us</a>
              <button type="button" data-act="info" data-val="feedback">Send Feedback</button>
            </div>
            <div class="f-col">
              <h4>Warranty Tools</h4>
              <a href="#/warranties" data-act="status" data-val="all">My Warranties</a>
              <a href="#/add">Add Warranty</a>
              <a href="#/warranties" data-act="status" data-val="active">Active Warranties</a>
              <a href="#/warranties" data-act="status" data-val="expiring">Expiring Soon</a>
              <a href="#/warranties" data-act="status" data-val="expired">Expired Warranties</a>
            </div>
            <div class="f-col">
              <h4>Let Us Help You</h4>
              <button type="button" data-act="info" data-val="account">Your Account</button>
              <button type="button" data-act="info" data-val="help">Help Center</button>
              <button type="button" data-act="info" data-val="help">FAQs</button>
              <button type="button" data-act="info" data-val="choices">Your Data Choices</button>
              <a href="#/logout">Logout</a>
            </div>
          </div>
        </div>

        <div class="f-mid">
          <div class="f-mid-in">
            <a class="f-brand" href="#/warranties" data-act="status" data-val="all" aria-label="Digital Warranty Card home">${LOGO(46)}<span>Digital Warranty Card</span></a>
            <div class="f-pills">
              <button class="f-pill" type="button" data-act="pref" data-val="lang" aria-label="Choose language">&#127760; <b>${esc(p.lang)}</b> <span class="car">&#9660;</span></button>
              <button class="f-pill" type="button" data-act="pref" data-val="cur" aria-label="Choose currency"><b>${esc(p.cur)}</b> - ${esc(CURRENCIES[p.cur].name)} <span class="car">&#9660;</span></button>
              <button class="f-pill" type="button" data-act="pref" data-val="country" aria-label="Choose country">&#128205; <b>${esc(p.country)}</b> <span class="car">&#9660;</span></button>
            </div>
          </div>
        </div>

        <div class="f-dir">
          <div class="f-dir-grid">${directory}</div>
        </div>

        <div class="f-bottom">
          <div class="f-links">
            <button type="button" data-act="info" data-val="terms">Conditions of Use</button>
            <button type="button" data-act="info" data-val="privacy">Privacy Notice</button>
            <button type="button" data-act="info" data-val="choices">Your Data Choices</button>
            <button type="button" data-act="info" data-val="help">Help</button>
            <button type="button" data-act="info" data-val="contact">Contact</button>
          </div>
          <p>&copy; ${yr} Digital Warranty Card &middot; WDP Project. All rights reserved.</p>
          <p class="made">Made with &#10084; by ${esc(AUTHOR)}</p>
        </div>
      </footer>`;
  }

  function miniFooter() {
    return `
      <footer class="mini-foot">
        <div class="mf-links">
          <button type="button" data-act="info" data-val="privacy">Privacy Policy</button>
          <button type="button" data-act="info" data-val="terms">Conditions of Use</button>
          <button type="button" data-act="info" data-val="help">Help Center</button>
          <button type="button" data-act="info" data-val="contact">Contact</button>
        </div>
        <p>&copy; ${new Date().getFullYear()} Digital Warranty Card &middot;</p>
      </footer>`;
  }

  /* ================= Layout: header + shell ================= */
  function shell(active, inner) {
    const u = getSession();
    const cards = getCards();
    const first = u.name.trim().split(/\s+/)[0];
    const initials = u.name.split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
    const onW = active === 'warranties';

    const sub = [
      { t: 'My Warranties', act: 'status', val: 'all', on: onW && ui.status === 'all' && ui.cat === 'All' && !ui.q },
      { t: 'Add Warranty', href: '#/add', on: active === 'add' },
      { t: 'Active', act: 'status', val: 'active', on: onW && ui.status === 'active' },
      { t: 'Expiring Soon', act: 'status', val: 'expiring', on: onW && ui.status === 'expiring' },
      { t: 'Expired', act: 'status', val: 'expired', on: onW && ui.status === 'expired' },
      ...['Mobile', 'Laptop', 'Television', 'Home Appliance'].map(c => ({ t: c, act: 'cat', val: c, on: onW && ui.cat === c })),
      { t: 'Help', act: 'info', val: 'help', on: false }
    ];
    const subHTML = sub.map(i => i.href
      ? `<a href="${i.href}" class="${i.on ? 'on' : ''}">${i.t}</a>`
      : `<button type="button" class="${i.on ? 'on' : ''}" data-act="${i.act}" data-val="${i.val}">${i.t}</button>`
    ).join('');

    const catOptions = ['All', ...CATEGORIES].map(c =>
      `<option value="${c}" ${(onW ? ui.cat : 'All') === c ? 'selected' : ''}>${c === 'All' ? 'All Categories' : c}</option>`).join('');

    app.innerHTML = `
      <div class="site-header">
        <div class="hdr">
          <a class="hdr-brand" href="#/warranties" data-act="status" data-val="all" aria-label="Digital Warranty Card home">
            ${LOGO(48)}
            <span class="hb-wrap">
              <span class="hb-name">Digital Warranty <i>Card</i></span>
              <small class="hb-tag">keep every guarantee safe</small>
            </span>
          </a>

          <form class="hdr-search" id="hSearch" role="search">
            <select id="hCat" aria-label="Search category">${catOptions}</select>
            <input id="hQ" type="search" placeholder="Search product, brand or serial number" value="${onW ? esc(ui.q) : ''}" autocomplete="off">
            <button type="submit" aria-label="Search">${ICON.search}</button>
          </form>

          <div class="acct" id="acct">
            <button class="hdr-item acct-btn" type="button" data-act="acct" aria-haspopup="true" aria-expanded="false">
              <span class="avatar sm">${esc(initials)}</span>
              <span class="tx"><small>Hello, ${esc(first)}</small><b>Account &amp; Settings &#9662;</b></span>
            </button>
            <div class="acct-menu" role="menu">
              <div class="am-user">
                <span class="avatar">${esc(initials)}</span>
                <div><b>${esc(u.name)}</b><small>${esc(u.email)}</small></div>
              </div>
              <a href="#/warranties" data-act="status" data-val="all">My Warranties</a>
              <a href="#/add">Add Warranty</a>
              <button class="am-link" type="button" data-act="info" data-val="account">Account details</button>
              <button class="am-link" type="button" data-act="info" data-val="help">Help Center</button>
              <a class="am-out" href="#/logout">Logout</a>
            </div>
          </div>

          <a class="hdr-item wl" href="#/warranties" data-act="status" data-val="all" aria-label="My warranties">
            <span class="wl-ico">${ICON.shield}<em class="count">${cards.length}</em></span>
            <span class="tx"><small>Your</small><b>Warranties</b></span>
          </a>

          <a class="hdr-item addi" href="#/add" aria-label="Add warranty">
            <span class="plus-ico">${ICON.plus}</span>
            <span class="tx"><small>New</small><b>Add Warranty</b></span>
          </a>
        </div>

        <nav class="subnav" aria-label="Main">
          <button type="button" class="all-btn" data-act="drawer">&#9776; All</button>
          ${subHTML}
        </nav>
      </div>

      <div class="d-overlay" id="dOverlay" data-act="drawer-close"></div>
      <aside class="drawer" id="drawer" aria-label="Menu">
        <div class="d-head">
          <span class="avatar">${esc(initials)}</span>
          <b>Hello, ${esc(first)}</b>
          <button class="d-x" type="button" data-act="drawer-close" aria-label="Close menu">&times;</button>
        </div>
        <div class="d-body">
          <h4>Warranties</h4>
          <button class="d-item" type="button" data-act="status" data-val="all">My Warranties <span>&rsaquo;</span></button>
          <a class="d-item" href="#/add">Add Warranty <span>&rsaquo;</span></a>
          <hr>
          <h4>Status</h4>
          <button class="d-item" type="button" data-act="status" data-val="active">Active <span>&rsaquo;</span></button>
          <button class="d-item" type="button" data-act="status" data-val="expiring">Expiring Soon <span>&rsaquo;</span></button>
          <button class="d-item" type="button" data-act="status" data-val="expired">Expired <span>&rsaquo;</span></button>
          <hr>
          <h4>Browse by category</h4>
          ${CATEGORIES.map(c => `<button class="d-item" type="button" data-act="cat" data-val="${c}">${c} <span>&rsaquo;</span></button>`).join('')}
          <hr>
          <h4>Help &amp; Settings</h4>
          <button class="d-item" type="button" data-act="info" data-val="account">Your Account <span>&rsaquo;</span></button>
          <button class="d-item" type="button" data-act="pref" data-val="cur">Currency <span>&rsaquo;</span></button>
          <button class="d-item" type="button" data-act="info" data-val="help">Help Center <span>&rsaquo;</span></button>
          <button class="d-item" type="button" data-act="info" data-val="about">About Us <span>&rsaquo;</span></button>
          <a class="d-item out" href="#/logout">Logout <span>&rsaquo;</span></a>
        </div>
      </aside>

      <main class="page">${inner}</main>
      ${siteFooter()}`;

    /* header search behaviour */
    $('#hSearch').addEventListener('submit', e => {
      e.preventDefault();
      goWarranties({
        q: $('#hQ').value.trim(),
        cat: $('#hCat').value,
        status: currentView === 'warranties' ? ui.status : 'all',
        sort: currentView === 'warranties' ? ui.sort : 'new'
      });
    });
    $('#hQ').addEventListener('input', e => {
      if (liveDraw) { ui.q = e.target.value; liveDraw(); }
    });
    $('#hCat').addEventListener('change', e => {
      if (liveDraw) {
        ui.cat = e.target.value;
        const f = $('#fCat');
        if (f) f.value = ui.cat;
        liveDraw();
      }
    });
  }

  /* ================= View: Login / Register ================= */
  function viewLogin() {
    app.innerHTML = `
      <div class="auth">
        <aside class="auth-side">
          <div class="brand light script">${LOGO(48)}<span>Digital Warranty Card</span></div>
          <h1>All your warranties,<br>in <em>one secure place.</em></h1>
          <p>Stop searching for paper bills. Save every product warranty digitally and always know what is covered and what is about to expire.</p>
          <ul class="points">
            <li>Store unlimited warranty cards</li>
            <li>Automatic expiry tracking with status</li>
            <li>Search and filter in one click</li>
          </ul>
          <div class="mini-card">
            <div class="row"><small>SMART PHONE</small><span class="pill">Active</span></div>
            <strong>Galaxy S23 Ultra</strong>
            <div class="bar"><i></i></div>
          </div>
        </aside>

        <main class="auth-main">
          <div class="auth-box">
            <div class="auth-title">${LOGO(56)}<span>Digital Warranty Card</span></div>
            <h2 id="authTitle">Welcome back</h2>
            <p class="muted" id="authSub">Login to see your warranty cards.</p>

            <div class="tabs" role="tablist">
              <button class="tab active" data-tab="login" type="button" role="tab">Login</button>
              <button class="tab" data-tab="register" type="button" role="tab">Create account</button>
            </div>

            <form id="loginForm" novalidate>
              <label for="lEmail">Email address</label>
              <input id="lEmail" type="email" placeholder="you@example.com" autocomplete="email">
              <label for="lPass">Password</label>
              <div class="pw">
                <input id="lPass" type="password" placeholder="Enter your password" autocomplete="current-password">
                <button type="button" class="eye" data-eye="lPass">Show</button>
              </div>
              <button class="btn block" type="submit">Login</button>
            </form>

            <form id="regForm" novalidate hidden>
              <label for="rName">Full name</label>
              <input id="rName" type="text" placeholder="Your full name" autocomplete="name">
              <label for="rEmail">Email address</label>
              <input id="rEmail" type="email" placeholder="you@example.com" autocomplete="email">
              <label for="rPass">Password</label>
              <div class="pw">
                <input id="rPass" type="password" placeholder="Minimum 6 characters" autocomplete="new-password">
                <button type="button" class="eye" data-eye="rPass">Show</button>
              </div>
              <button class="btn block" type="submit">Create account</button>
            </form>

            <p id="msg" class="form-msg" role="alert"></p>
          </div>
          ${miniFooter()}
        </main>
      </div>`;

    const msg = $('#msg');
    const say = (t, ok) => { msg.textContent = t; msg.className = 'form-msg ' + (ok ? 'ok' : 'err'); };

    $$('.tab').forEach(btn => btn.addEventListener('click', () => {
      const login = btn.dataset.tab === 'login';
      $$('.tab').forEach(b => b.classList.toggle('active', b === btn));
      $('#loginForm').hidden = !login;
      $('#regForm').hidden = login;
      $('#authTitle').textContent = login ? 'Welcome back' : 'Create your account';
      $('#authSub').textContent = login ? 'Login to see your warranty cards.' : 'It takes less than a minute.';
      say('', true);
    }));

    $$('.eye').forEach(b => b.addEventListener('click', () => {
      const input = $('#' + b.dataset.eye);
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      b.textContent = show ? 'Hide' : 'Show';
    }));

    $('#loginForm').addEventListener('submit', e => {
      e.preventDefault();
      const email = $('#lEmail').value.trim().toLowerCase();
      const pass = $('#lPass').value;
      if (!email || !pass) return say('Please enter your email and password.');
      const user = getUsers().find(u => u.email === email && u.pass === pass);
      if (!user) return say('Incorrect email or password.');
      store.set(SESSION, { name: user.name, email: user.email });
      location.hash = '#/warranties';
    });

    $('#regForm').addEventListener('submit', e => {
      e.preventDefault();
      const name = $('#rName').value.trim();
      const email = $('#rEmail').value.trim().toLowerCase();
      const pass = $('#rPass').value;
      if (!name || !email || !pass) return say('Please fill in all the fields.');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return say('Please enter a valid email address.');
      if (pass.length < 6) return say('Password must be at least 6 characters.');
      const users = getUsers();
      if (users.some(u => u.email === email)) return say('An account with this email already exists.');
      users.push({ name, email, pass });
      store.set(USERS, users);
      store.set(SESSION, { name, email });
      location.hash = '#/warranties';
    });
  }

  /* ================= View: My Warranties ================= */
  function cardHTML(c) {
    const s = statusOf(c);
    return `
      <article class="wc ${s.key}">
        <div class="wc-head">
          <div class="wc-top"><span class="chip-gold"></span><span class="cat">${esc(c.category)}</span></div>
          <h3>${esc(c.product)}</h3>
          <div class="brand-name">${esc(c.brand)}</div>
          <div class="serial">${esc(c.serial)}</div>
        </div>
        <div class="wc-body">
          <div class="dates">
            <div><small>Purchased</small><b>${fmt(startOf(c))}</b></div>
            <div><small>Valid till</small><b>${fmt(expiryOf(c))}</b></div>
          </div>
          <div class="prog ${s.key}" title="Warranty remaining"><i style="width:${remainingPct(c)}%"></i></div>
          <div class="wc-foot">
            <span class="badge ${s.key}">${s.label}</span>
            <small>${s.text}</small>
            <button class="btn sm ghost" data-view="${c.id}" type="button">View details</button>
          </div>
        </div>
      </article>`;
  }

  function detailsHTML(c) {
    const s = statusOf(c);
    return `
      <div class="wc ${s.key}" style="box-shadow:none;border:none;border-radius:22px 22px 0 0">
        <div class="wc-head">
          <div class="wc-top"><span class="chip-gold"></span><span class="cat">${esc(c.category)}</span></div>
          <h3>${esc(c.product)}</h3>
          <div class="brand-name">${esc(c.brand)}</div>
          <div class="serial">${esc(c.serial)}</div>
        </div>
      </div>
      <div class="detail">
        <div><small>Status</small><b><span class="badge ${s.key}">${s.label}</span> &nbsp;${s.text}</b></div>
        <div><small>Warranty period</small><b>${c.months} month${Number(c.months) === 1 ? '' : 's'}</b></div>
        <div><small>Purchase date</small><b>${fmt(startOf(c))}</b></div>
        <div><small>Valid till</small><b>${fmt(expiryOf(c))}</b></div>
        <div><small>Store / Seller</small><b>${esc(c.store) || '-'}</b></div>
        <div><small>Price</small><b>${c.price ? esc(money(c.price)) : '-'}</b></div>
        <div class="full"><small>Notes</small><b>${esc(c.notes) || '-'}</b></div>
        <div class="full"><small>Added on</small><b>${fmt(c.addedOn)}</b></div>
      </div>`;
  }

  function viewWarranties() {
    const u = getSession();
    const first = u.name.trim().split(/\s+/)[0];
    const cards = getCards();
    const st = cards.map(c => statusOf(c).key);
    const n = k => st.filter(x => x === k).length;
    const unfiltered = ui.status === 'all' && ui.cat === 'All' && !ui.q;

    const top = unfiltered ? `
      <section class="hero">
        <div class="hero-txt">
          <p class="hero-hi">Hello, ${esc(first)}! &#128075;</p>
          <h1 class="hero-title">Digital Warranty Card</h1>
          <p class="hero-sub">Keep every guarantee safe, always.</p>
          <div class="hero-btns">
            <a class="btn" href="#/add">+ Add Warranty</a>
            <button class="btn ghost light" type="button" data-act="status" data-val="expiring">Expiring soon</button>
          </div>
        </div>
        <div class="hero-art">${LOGO(170)}</div>
      </section>` : `
      <div class="page-head">
        <div>
          <h1>My Warranties</h1>
          <p class="muted">Your filtered warranty cards.</p>
        </div>
        <a class="btn" href="#/add">+ Add Warranty</a>
      </div>`;

    shell('warranties', `
      ${top}

      ${n('expiring') > 0 && unfiltered ? `
      <div class="alert">
        <span class="ico">&#9203;</span>
        <div><b>${n('expiring')} warrant${n('expiring') === 1 ? 'y is' : 'ies are'} expiring within 30 days</b><br><small>Review them before the coverage ends.</small></div>
        <button class="btn sm" type="button" data-act="status" data-val="expiring">View now</button>
      </div>` : ''}

      <section class="stats">
        <div class="stat"><span class="stat-ico">&#128230;</span><div><strong>${cards.length}</strong><small>Total warranties</small></div></div>
        <div class="stat s-ok"><span class="stat-ico">&#9989;</span><div><strong>${n('active') + n('expiring')}</strong><small>Currently covered</small></div></div>
        <div class="stat s-warn"><span class="stat-ico">&#9203;</span><div><strong>${n('expiring')}</strong><small>Expiring in 30 days</small></div></div>
        <div class="stat s-bad"><span class="stat-ico">&#9940;</span><div><strong>${n('expired')}</strong><small>Expired</small></div></div>
      </section>

      <div class="toolbar">
        <select id="fStatus" aria-label="Filter by status">
          <option value="all">All statuses</option>
          <option value="active">Active (covered)</option>
          <option value="expiring">Expiring soon</option>
          <option value="expired">Expired</option>
        </select>
        <select id="fCat" aria-label="Filter by category">
          <option value="All">All categories</option>
          ${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}
        </select>
        <select id="fSort" aria-label="Sort">
          <option value="new">Newest first</option>
          <option value="soon">Expiring first</option>
          <option value="name">Name A-Z</option>
        </select>
      </div>

      <div class="result-bar" id="resultBar"></div>
      <section id="grid" class="grid"></section>`);

    const grid = $('#grid');
    $('#fStatus').value = ui.status;
    $('#fCat').value = ui.cat;
    $('#fSort').value = ui.sort;

    function draw() {
      const q = ui.q.trim().toLowerCase();
      const list = cards.filter(c => {
        const hay = `${c.product} ${c.brand} ${c.serial} ${c.category}`.toLowerCase();
        const k = statusOf(c).key;
        const okStatus = ui.status === 'all' || (ui.status === 'active' ? k !== 'expired' : k === ui.status);
        const okCat = ui.cat === 'All' || c.category === ui.cat;
        return hay.includes(q) && okStatus && okCat;
      });

      if (ui.sort === 'new') list.sort((a, b) => b.id - a.id);
      if (ui.sort === 'soon') list.sort((a, b) => expiryOf(a) - expiryOf(b));
      if (ui.sort === 'name') list.sort((a, b) => a.product.localeCompare(b.product));

      const filtered = q || ui.cat !== 'All' || ui.status !== 'all';
      let info = `Showing <b>${list.length}</b> of <b>${cards.length}</b> warrant${cards.length === 1 ? 'y' : 'ies'}`;
      if (q) info += ` for "<b>${esc(ui.q.trim())}</b>"`;
      if (ui.cat !== 'All') info += ` in <b>${esc(ui.cat)}</b>`;
      if (ui.status !== 'all') info += ` &middot; <b>${STATUS_LABEL[ui.status]}</b>`;
      $('#resultBar').innerHTML = cards.length
        ? `<span>${info}</span>${filtered ? '<button class="link-btn" type="button" data-act="status" data-val="all">Clear filters</button>' : ''}`
        : '';

      if (!list.length) {
        grid.innerHTML = cards.length
          ? `<div class="empty"><div class="ico">&#128269;</div><h3>No results found</h3><p class="muted">Try a different search or filter.</p><button class="btn" type="button" data-act="status" data-val="all">Clear filters</button></div>`
          : `<div class="empty"><div class="ico">&#128737;</div><h3>No warranty cards yet</h3><p class="muted">Add your first product warranty to get started.</p><a class="btn" href="#/add">+ Add Warranty</a></div>`;
        return;
      }
      grid.innerHTML = list.map(cardHTML).join('');
    }

    $('#fStatus').addEventListener('change', e => { ui.status = e.target.value; draw(); });
    $('#fCat').addEventListener('change', e => { ui.cat = e.target.value; $('#hCat').value = ui.cat; draw(); });
    $('#fSort').addEventListener('change', e => { ui.sort = e.target.value; draw(); });
    grid.addEventListener('click', e => {
      const b = e.target.closest('[data-view]');
      if (!b) return;
      const c = cards.find(x => String(x.id) === b.dataset.view);
      if (c) openModal(detailsHTML(c));
    });

    liveDraw = draw;
    draw();
  }

  /* ================= View: Add Warranty ================= */
  function viewAdd() {
    shell('add', `
      <div class="page-head">
        <div>
          <h1>Add Warranty</h1>
          <p class="muted">Enter the product details to create a new warranty card.</p>
        </div>
        <a class="btn ghost" href="#/warranties" data-act="status" data-val="all">&larr; Back to My Warranties</a>
      </div>

      <div class="add-layout">
        <form id="addForm" class="panel" novalidate>
          <h2>Product details</h2>
          <div class="row2">
            <div><label for="product">Product name *</label><input id="product" type="text" placeholder="e.g. Galaxy S23 Ultra"></div>
            <div><label for="brand">Brand *</label><input id="brand" type="text" placeholder="e.g. Samsung"></div>
          </div>
          <div class="row2">
            <div>
              <label for="category">Category *</label>
              <select id="category">
                <option value="">Select category</option>
                ${CATEGORIES.map(c => `<option>${c}</option>`).join('')}
              </select>
            </div>
            <div><label for="serial">Serial / IMEI number *</label><input id="serial" type="text" placeholder="e.g. SN123456789"></div>
          </div>
          <div class="row2">
            <div><label for="purchaseDate">Purchase date *</label><input id="purchaseDate" type="date" max="${isoToday()}"></div>
            <div><label for="months">Warranty period (months) *</label><input id="months" type="number" min="1" max="120" placeholder="e.g. 12"></div>
          </div>
          <div class="row2">
            <div><label for="store">Store / Seller</label><input id="store" type="text" placeholder="e.g. Croma, Ahmedabad"></div>
            <div><label for="price">Price (&#8377; INR)</label><input id="price" type="number" min="0" placeholder="e.g. 54999"></div>
          </div>
          <label for="notes">Notes</label>
          <textarea id="notes" rows="3" placeholder="Invoice number, extended warranty details, etc."></textarea>

          <p id="msg" class="form-msg" role="alert"></p>
          <button class="btn" type="submit">Save warranty card</button>
        </form>

        <aside class="panel side-info">
          <h2>Warranty preview</h2>
          <p>Your expiry date is calculated automatically.</p>
          <div class="preview">
            <small>Valid till</small>
            <strong id="pvDate">&mdash;</strong>
            <small id="pvNote">Fill in purchase date and period</small>
          </div>
          <ul class="tips">
            <li>Keep the serial number exactly as printed on the bill.</li>
            <li>Each serial number can be saved only once.</li>
            <li>Enter the price in rupees. You can view it in other currencies from the footer.</li>
          </ul>
        </aside>
      </div>`);

    const msg = $('#msg');
    const say = t => { msg.textContent = t; msg.className = 'form-msg err'; };

    function preview() {
      const d = $('#purchaseDate').value;
      const m = Number($('#months').value);
      if (d && m > 0 && m <= 120) {
        const exp = addMonths(d, m);
        $('#pvDate').textContent = fmt(exp);
        const left = Math.round((exp - today0()) / 86400000);
        $('#pvNote').textContent = left >= 0 ? `${left} days of cover remaining` : 'This warranty has already expired';
      } else {
        $('#pvDate').innerHTML = '&mdash;';
        $('#pvNote').textContent = 'Fill in purchase date and period';
      }
    }
    $('#purchaseDate').addEventListener('input', preview);
    $('#months').addEventListener('input', preview);

    $('#addForm').addEventListener('submit', e => {
      e.preventDefault();
      const data = {
        product: $('#product').value.trim(),
        brand: $('#brand').value.trim(),
        category: $('#category').value,
        serial: $('#serial').value.trim(),
        purchaseDate: $('#purchaseDate').value,
        months: Number($('#months').value),
        store: $('#store').value.trim(),
        price: $('#price').value,
        notes: $('#notes').value.trim()
      };

      if (!data.product || !data.brand || !data.category || !data.serial || !data.purchaseDate || !data.months) {
        return say('Please fill in all the required (*) fields.');
      }
      if (data.purchaseDate > isoToday()) return say('Purchase date cannot be in the future.');
      if (!Number.isInteger(data.months) || data.months < 1 || data.months > 120) {
        return say('Warranty period must be between 1 and 120 months.');
      }
      const cards = getCards();
      if (cards.some(c => c.serial.toLowerCase() === data.serial.toLowerCase())) {
        return say('A warranty with this serial number is already saved.');
      }

      cards.push({ id: Date.now(), ...data, addedOn: new Date().toISOString() });
      setCards(cards);
      toast('Warranty card saved successfully');
      location.hash = '#/warranties';
    });
  }

  /* ================= View: Logout ================= */
  function viewLogout() {
    localStorage.removeItem(SESSION);
    ui = defaultUI();
    app.innerHTML = `
      <div class="logout-wrap">
        <div class="logout-box">
          <div class="brand script">${LOGO(48)}<span>Digital Warranty Card</span></div>
          <div class="tick">&#10003;</div>
          <h2>You have been logged out</h2>
          <p class="muted">Your warranty cards are safe and will be here when you come back.</p>
          <a class="btn" href="#/login">Login again</a>
        </div>
        ${miniFooter()}
      </div>`;
  }

  /* ================= Router ================= */
  const titles = { login: 'Login', warranties: 'My Warranties', add: 'Add Warranty', logout: 'Logged out' };
  const views = { login: viewLogin, warranties: viewWarranties, add: viewAdd, logout: viewLogout };

  function router() {
    closeModal();
    closeDrawer();
    liveDraw = null;

    const keep = keepUI;
    if (!keep) ui = defaultUI();
    keepUI = false;

    let name = location.hash.replace(/^#\/?/, '').split('?')[0];
    const user = getSession();

    if (!views[name]) name = user ? 'warranties' : 'login';
    if (!user && (name === 'warranties' || name === 'add')) name = 'login';
    if (user && name === 'login') name = 'warranties';

    if (location.hash !== '#/' + name) history.replaceState(null, '', '#/' + name);
    currentView = name;
    document.title = titles[name] + ' | Digital Warranty Card';
    views[name]();
    window.scrollTo(0, 0);
  }

  window.addEventListener('hashchange', router);
  router();
})();