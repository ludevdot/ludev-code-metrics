import type { SidebarI18n } from './types';

export function getSkillsTabStyles(): string {
  return `
    /* ── Skills section ── */
    .skills-search {
      width: 100%;
      padding: 5px 8px;
      font-size: 12px;
      font-family: var(--vscode-font-family);
      background: var(--vscode-input-background);
      color: var(--vscode-input-foreground);
      border: 1px solid var(--vscode-input-border, rgba(128,128,128,0.3));
      border-radius: 4px;
      outline: none;
      margin-bottom: 6px;
    }
    .skills-search:focus { border-color: var(--vscode-focusBorder, #007fd4); }
    .skills-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .skills-placeholder { font-size: 11px; opacity: 0.45; padding: 4px 2px; }
    .skill-item {
      display: flex;
      align-items: baseline;
      gap: 6px;
      padding: 5px 7px;
      border-radius: 5px;
      cursor: pointer;
      transition: background 0.12s;
    }
    .skill-item:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.1)); }
    .skill-item.installed::after {
      content: '✓';
      margin-left: auto;
      font-size: 10px;
      opacity: 0.6;
      color: var(--vscode-charts-green, #4caf74);
    }
    .skill-name     { font-size: 12px; font-weight: 600; flex-shrink: 0; }
    .skill-source   { font-size: 10px; opacity: 0.5; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .skill-installs { font-size: 10px; opacity: 0.45; flex-shrink: 0; margin-left: auto; }
    .skills-refine  { font-size: 10px; opacity: 0.5; font-style: italic; padding: 4px 2px 0; }
    .skills-loader {
      display: flex;
      gap: 5px;
      justify-content: center;
      padding: 18px 0 10px;
    }
    .skills-loader span {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: var(--vscode-foreground);
      opacity: 0.35;
      animation: skills-bounce 1s ease-in-out infinite;
    }
    .skills-loader span:nth-child(2) { animation-delay: 0.15s; }
    .skills-loader span:nth-child(3) { animation-delay: 0.30s; }
    @keyframes skills-bounce {
      0%, 80%, 100% { transform: scale(0.6); opacity: 0.25; }
      40%           { transform: scale(1);   opacity: 0.7; }
    }

    /* ── Skill preview panel ── */
    .skill-preview {
      margin-top: 8px;
      border: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.2));
      border-radius: 6px;
      overflow: hidden;
    }
    .skill-preview-header {
      display: flex;
      align-items: baseline;
      gap: 6px;
      padding: 8px 10px 6px;
      background: var(--vscode-editor-background);
      border-bottom: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.15));
    }
    .skill-preview-name   { font-size: 12px; font-weight: 600; }
    .skill-preview-source { font-size: 10px; opacity: 0.5; }
    .skill-preview-content {
      font-size: 10px;
      font-family: var(--vscode-editor-font-family, monospace);
      line-height: 1.5;
      padding: 8px 10px;
      max-height: 160px;
      overflow-y: auto;
      white-space: pre-wrap;
      word-break: break-word;
      background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.06));
    }
    .skill-preview-actions {
      display: flex;
      gap: 6px;
      padding: 8px 10px;
      background: var(--vscode-editor-background);
      border-top: 1px solid var(--vscode-widget-border, rgba(128,128,128,0.15));
    }
    .skill-preview-feedback {
      padding: 4px 10px 6px;
      font-size: 11px;
      background: var(--vscode-editor-background);
    }
    .skill-preview-feedback.success { color: var(--vscode-charts-green, #4caf74); }
    .skill-preview-feedback.error   { color: var(--vscode-errorForeground, #f44); }
  `;
}

export function getSkillsTabHtml(i18n: Pick<SidebarI18n, 'skillsSearch' | 'skillsEmpty' | 'skillsRefine' | 'skillsInstall' | 'skillsCancel'>): string {
  return /* html */`
  <div id="tab-skills" class="tab-panel hidden">
    <input
      class="skills-search"
      id="skillsSearch"
      type="text"
      placeholder="${i18n.skillsSearch}"
      autocomplete="off"
    />
    <div class="skills-loader hidden" id="skillsLoader">
      <span></span><span></span><span></span>
    </div>
    <ul class="skills-list" id="skillsList">
      <li class="skills-placeholder">${i18n.skillsEmpty}</li>
    </ul>
    <p class="skills-refine hidden" id="skillsRefine">${i18n.skillsRefine}</p>
    <div class="skill-preview hidden" id="skillPreview">
      <div class="skill-preview-header">
        <span class="skill-preview-name" id="previewName"></span>
        <span class="skill-preview-source" id="previewSource"></span>
      </div>
      <pre class="skill-preview-content" id="previewContent"></pre>
      <div class="skill-preview-actions">
        <button class="action-btn action-btn--primary" id="btnInstall">${i18n.skillsInstall}</button>
        <button class="action-btn action-btn--secondary" id="btnCancel">${i18n.skillsCancel}</button>
      </div>
      <div class="skill-preview-feedback hidden" id="installFeedback"></div>
    </div>
  </div><!-- #tab-skills -->`;
}

// Assumes I18N and vscode are defined in outer scope
export function getSkillsTabScript(): string {
  return `
  (function () {
    const searchInput  = document.getElementById('skillsSearch');
    const skillsLoader = document.getElementById('skillsLoader');
    const skillsList   = document.getElementById('skillsList');
    const refineWarn   = document.getElementById('skillsRefine');
    const skillPreview = document.getElementById('skillPreview');
    const previewName  = document.getElementById('previewName');
    const previewSrc   = document.getElementById('previewSource');
    const previewCont  = document.getElementById('previewContent');
    const btnInstall   = document.getElementById('btnInstall');
    const btnCancel    = document.getElementById('btnCancel');
    const feedback     = document.getElementById('installFeedback');
    let debounceTimer;
    let selectedSkill = null;
    let installedIds  = [];
    let _initialized  = false;

    function showLoader() {
      skillsLoader.classList.remove('hidden');
      skillsList.classList.add('hidden');
      refineWarn.classList.add('hidden');
    }
    function hideLoader() {
      skillsLoader.classList.add('hidden');
      skillsList.classList.remove('hidden');
    }

    function renderSkills(skills, count) {
      hideLoader();
      skillsList.innerHTML = '';
      refineWarn.classList.toggle('hidden', count < 50);
      if (!skills.length) {
        const li = document.createElement('li');
        li.className   = 'skills-placeholder';
        li.textContent = I18N.skillsNoResults;
        skillsList.appendChild(li);
        return;
      }
      skills.forEach(function (skill) {
        const li = document.createElement('li');
        li.className      = 'skill-item' + (installedIds.includes(skill.skillId) ? ' installed' : '');
        li.dataset.skillId = skill.skillId;
        li.innerHTML =
          '<span class="skill-name">'     + skill.name     + '</span>' +
          '<span class="skill-source">'   + skill.source   + '</span>' +
          '<span class="skill-installs">' + skill.installs + ' ' + I18N.skillsInstalls + '</span>';
        li.addEventListener('click', function () {
          vscode.postMessage({ type: 'selectSkill', skill: skill });
        });
        skillsList.appendChild(li);
      });
    }

    // Called by the tab switcher when the Skills tab is first activated
    window._skillsTabActivate = function () {
      if (_initialized) { return; }
      showLoader();
      vscode.postMessage({ type: 'searchSkills', query: '' });
    };

    searchInput.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      const query = searchInput.value.trim();
      if (query.length < 2) {
        if (query.length === 0 && _initialized) { return; } // keep existing results
        hideLoader();
        skillsList.innerHTML = '<li class="skills-placeholder">' + I18N.skillsEmpty + '</li>';
        refineWarn.classList.add('hidden');
        return;
      }
      showLoader();
      debounceTimer = setTimeout(function () {
        vscode.postMessage({ type: 'searchSkills', query: query });
      }, 400);
    });

    function showPreview(skill, content) {
      selectedSkill           = skill;
      previewName.textContent = skill.name;
      previewSrc.textContent  = skill.source;
      previewCont.textContent = content;
      feedback.className      = 'skill-preview-feedback hidden';
      feedback.textContent    = '';
      btnInstall.disabled     = false;
      btnInstall.textContent  = I18N.skillsInstall;
      skillPreview.classList.remove('hidden');
    }

    function hidePreview() {
      skillPreview.classList.add('hidden');
      selectedSkill = null;
    }

    btnInstall.addEventListener('click', function () {
      if (!selectedSkill) { return; }
      btnInstall.disabled    = true;
      btnInstall.textContent = I18N.skillsInstalling;
      feedback.className     = 'skill-preview-feedback hidden';
      vscode.postMessage({ type: 'installSkill', skill: selectedSkill });
    });

    btnCancel.addEventListener('click', hidePreview);

    window.addEventListener('message', function (event) {
      const msg = event.data;
      if (msg.type === 'searchResults') {
        _initialized = true;
        renderSkills(msg.skills, msg.count);
      }
      if (msg.type === 'cacheResults') {
        _initialized = true;
        hideLoader();
        renderSkills(msg.skills, msg.count);
      }
      if (msg.type === 'installedSkills') { installedIds = msg.ids; }
      if (msg.type === 'skillPreview')    { showPreview(msg.skill, msg.content); }
      if (msg.type === 'installSuccess') {
        if (!installedIds.includes(msg.skillId)) { installedIds.push(msg.skillId); }
        const item = skillsList.querySelector('[data-skill-id="' + msg.skillId + '"]');
        if (item) { item.classList.add('installed'); }
        feedback.textContent = I18N.skillsInstallOk;
        feedback.className   = 'skill-preview-feedback success';
        btnInstall.textContent = I18N.skillsInstalled;
        setTimeout(hidePreview, 1500);
      }
      if (msg.type === 'installError') {
        feedback.textContent   = I18N.skillsInstallErr + ' ' + msg.error;
        feedback.className     = 'skill-preview-feedback error';
        btnInstall.disabled    = false;
        btnInstall.textContent = I18N.skillsInstall;
      }
    });
  }());
  `;
}
