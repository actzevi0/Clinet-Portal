/**
 * EasyFinance – Agent Auth Guard
 * Include this in all admin pages to enforce authentication
 */

(function() {
  'use strict';

  const API_BASE = '';
  window.AGENT_AUTH = {};
  window.IS_DEMO_MODE = false;
  window.CURRENT_AGENT = null;

  // ── Get stored session ─────────────────────────────────────────
  function getStoredToken() {
    return sessionStorage.getItem('agent_token') || localStorage.getItem('agent_token');
  }

  function getStoredAgent() {
    try {
      const s = localStorage.getItem('agent_info');
      return s ? JSON.parse(s) : null;
    } catch(e) { return null; }
  }

  // ── Logout ─────────────────────────────────────────────────────
  window.agentLogout = async function() {
    const token = getStoredToken();
    if (token && !window.IS_DEMO_MODE) {
      try {
        await fetch('/auth/logout', {
          method: 'POST',
          headers: { 'X-Session-Token': token }
        });
      } catch(e) {}
    }
    sessionStorage.removeItem('agent_token');
    localStorage.removeItem('agent_token');
    localStorage.removeItem('agent_info');
    window.location.replace('/admin/login.html');
  };

  // ── API helper with auth ────────────────────────────────────────
  window.authFetch = async function(url, options={}) {
    const token = getStoredToken();
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (token && token !== 'demo-token') {
      headers['X-Session-Token'] = token;
    }
    return fetch(url, { ...options, headers });
  };

  // ── Inject header bar ──────────────────────────────────────────
  function injectHeader(agent) {
    const isImpersonating = localStorage.getItem('impersonating_agent');
    const roleLabel = agent.role === 'superadmin' ? 'סופר אדמין' :
                      agent.plan === 'pro' ? 'Pro' : 'Basic';
    const roleBadgeColor = agent.role === 'superadmin' ? '#8b5cf6' :
                           agent.plan === 'pro' ? '#10b981' : '#6b7280';

    const bar = document.createElement('div');
    bar.id = 'agentAuthBar';
    bar.style.cssText = `
      position:fixed; top:0; left:0; right:0; z-index:9999;
      background:var(--bg-card,#1e2837); border-bottom:1px solid var(--border,#2d3748);
      display:flex; align-items:center; justify-content:space-between;
      padding:0 20px; height:44px; font-family:Heebo,sans-serif; font-size:.82rem;
    `;

    const logoHtml = agent.logo_url
      ? `<img src="${agent.logo_url}" style="max-height:28px;max-width:80px;object-fit:contain;margin-left:10px;" alt="לוגו">`
      : '';

    bar.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;">
        ${logoHtml}
        <span style="font-weight:700;color:var(--primary,#1a56db);">EasyFinance</span>
        ${isImpersonating ? `
          <span style="background:#f59e0b;color:#000;padding:2px 10px;border-radius:20px;font-size:.74rem;font-weight:700;">
            <i class="fas fa-mask" style="margin-left:4px;"></i>מתחזה: ${agent.name}
          </span>
          <button onclick="stopImpersonating()" style="background:#ef4444;color:#fff;border:none;border-radius:6px;padding:3px 10px;font-size:.74rem;cursor:pointer;font-family:Heebo,sans-serif;">
            <i class="fas fa-sign-out-alt"></i> חזור לחשבון שלי
          </button>
        ` : ''}
      </div>
      <div style="display:flex;align-items:center;gap:14px;">
        ${window.IS_DEMO_MODE ? `<span style="background:#f59e0b22;color:#f59e0b;padding:2px 10px;border-radius:20px;font-size:.74rem;font-weight:700;">Demo Mode</span>` : ''}
        <span style="color:var(--text-muted,#9ca3af);">
          <i class="fas fa-user-circle" style="margin-left:6px;"></i>
          ${agent.name}
          <span style="background:${roleBadgeColor}22;color:${roleBadgeColor};padding:1px 7px;border-radius:10px;margin-right:6px;font-size:.72rem;">${roleLabel}</span>
        </span>
        ${agent.role === 'superadmin' ? `<a href="/admin/superadmin.html" style="color:var(--primary,#1a56db);text-decoration:none;font-weight:600;font-size:.78rem;"><i class="fas fa-cog"></i> סופר אדמין</a>` : ''}
        <a href="/admin/index.html" style="color:var(--text-muted,#9ca3af);text-decoration:none;font-size:.78rem;"><i class="fas fa-home"></i> ראשי</a>
        <button onclick="agentLogout()" style="background:none;border:1px solid var(--border,#2d3748);color:var(--text-muted,#9ca3af);border-radius:6px;padding:3px 10px;font-size:.78rem;cursor:pointer;font-family:Heebo,sans-serif;">
          <i class="fas fa-sign-out-alt"></i> יציאה
        </button>
      </div>
    `;

    document.body.insertBefore(bar, document.body.firstChild);

    // Add top padding to body (only if not already set)
    if (!document.body.style.paddingTop || document.body.style.paddingTop === '0px') {
      document.body.style.paddingTop = '44px';
    }
  }

  window.stopImpersonating = async function() {
    const origToken = localStorage.getItem('orig_agent_token');
    const origAgent = localStorage.getItem('orig_agent_info');
    if (origToken) {
      localStorage.setItem('agent_token', origToken);
      sessionStorage.setItem('agent_token', origToken);
      localStorage.setItem('agent_info', origAgent||'{}');
      localStorage.removeItem('impersonating_agent');
      localStorage.removeItem('orig_agent_token');
      localStorage.removeItem('orig_agent_info');
      window.location.replace('/admin/superadmin.html');
    }
  };

  // ── Main guard ─────────────────────────────────────────────────
  window.AGENT_AUTH.init = async function(options={}) {
    const {
      requireRole = null,       // 'superadmin' or null (any)
      redirectTo  = '/admin/login.html'
    } = options;

    const token = getStoredToken();

    // Demo mode check
    if (token === 'demo-token') {
      window.IS_DEMO_MODE = true;
      const agent = getStoredAgent() || {
        id:'demo-agent', name:'סוכן Demo', email:'demo@demo.com',
        role:'agent', plan:'pro', client_quota:50
      };
      window.CURRENT_AGENT = agent;
      injectHeader(agent);
      return agent;
    }

    if (!token) {
      window.location.replace(redirectTo + '?redirect=' + encodeURIComponent(window.location.pathname));
      return null;
    }

    // Validate token with server
    try {
      const r = await fetch('/auth/me', {
        headers: { 'X-Session-Token': token }
      });

      if (!r.ok) {
        // Token expired or invalid
        if (r.status === 503) {
          // DB not available — switch to demo mode
          window.IS_DEMO_MODE = true;
          const agent = getStoredAgent() || {id:'demo-agent',name:'Demo',email:'',role:'agent',plan:'pro',client_quota:50};
          window.CURRENT_AGENT = agent;
          injectHeader(agent);
          return agent;
        }
        // Redirect to login
        sessionStorage.removeItem('agent_token');
        localStorage.removeItem('agent_token');
        window.location.replace(redirectTo + '?reason=session_expired');
        return null;
      }

      const agent = await r.json();
      window.CURRENT_AGENT = agent;

      if (requireRole && agent.role !== requireRole && agent.role !== 'superadmin') {
        window.location.replace('/admin/index.html?reason=forbidden');
        return null;
      }

      // Load logo from settings
      try {
        const settingsR = await fetch('/agent/settings', {
          headers: { 'X-Session-Token': token }
        });
        if (settingsR.ok) {
          const settings = await settingsR.json();
          if (settings.logo_url) agent.logo_url = settings.logo_url;
          window.AGENT_SETTINGS = settings;
        }
      } catch(e) {}

      injectHeader(agent);
      return agent;

    } catch(e) {
      // Network error — try demo mode fallback
      window.IS_DEMO_MODE = true;
      const agent = getStoredAgent();
      if (agent) {
        window.CURRENT_AGENT = agent;
        injectHeader(agent);
        return agent;
      }
      window.location.replace(redirectTo);
      return null;
    }
  };

})();
