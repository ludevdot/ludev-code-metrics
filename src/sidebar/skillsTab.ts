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
    #tab-skills {
      overflow-y: hidden;
      display: flex;
      flex-direction: column;
    }
    .skills-list {
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 2px;
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      padding-bottom: 8px;
    }
    .skills-placeholder { font-size: 11px; opacity: 0.45; padding: 4px 2px; }
    .skill-item {
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 6px 7px;
      border-radius: 5px;
    }
    .skill-info {
      display: flex;
      align-items: baseline;
      gap: 6px;
    }
    .skill-name     { font-size: 12px; font-weight: 600; flex-shrink: 0; }
    .skill-source   { font-size: 10px; opacity: 0.5; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .skill-installs { font-size: 10px; opacity: 0.45; flex-shrink: 0; margin-left: auto; }
    .skill-actions  { display: flex; gap: 5px; align-items: center; flex-wrap: wrap; }
    .skill-btn {
      font-size: 10px;
      padding: 2px 7px;
      border-radius: 3px;
      border: 1px solid var(--vscode-button-border, transparent);
      cursor: pointer;
      font-family: var(--vscode-font-family);
      line-height: 1.5;
    }
    .skill-btn-install {
      background: var(--vscode-button-background);
      color: var(--vscode-button-foreground);
    }
    .skill-btn-install:hover:not(:disabled) { background: var(--vscode-button-hoverBackground); }
    .skill-btn-install:disabled { opacity: 0.6; cursor: default; }
    .skill-btn-install.installed {
      background: transparent;
      color: var(--vscode-charts-green, #4caf74);
      border-color: var(--vscode-charts-green, #4caf74);
    }
    .skill-btn-view {
      background: transparent;
      color: var(--vscode-foreground);
      border-color: var(--vscode-button-secondaryBorder, rgba(128,128,128,0.4));
    }
    .skill-btn-view:hover { background: var(--vscode-toolbar-hoverBackground, rgba(128,128,128,0.1)); }
    .skill-feedback {
      font-size: 10px;
      padding: 1px 0;
    }
    .skill-feedback.success { color: var(--vscode-charts-green, #4caf74); }
    .skill-feedback.error   { color: var(--vscode-errorForeground, #f44); }
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
  `;
}

export function getSkillsTabHtml(i18n: Pick<SidebarI18n, 'skillsSearch' | 'skillsEmpty' | 'skillsRefine'>): string {
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
    let debounceTimer;
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
        const isInstalled = installedIds.includes(skill.skillId);
        const li = document.createElement('li');
        li.className       = 'skill-item';
        li.dataset.skillId = skill.skillId;

        const info = document.createElement('div');
        info.className = 'skill-info';
        info.innerHTML =
          '<span class="skill-name">'     + skill.name     + '</span>' +
          '<span class="skill-source">'   + skill.source   + '</span>' +
          '<span class="skill-installs">' + skill.installs + ' ' + I18N.skillsInstalls + '</span>';

        const actions = document.createElement('div');
        actions.className = 'skill-actions';

        const btnInstall = document.createElement('button');
        btnInstall.className   = 'skill-btn skill-btn-install' + (isInstalled ? ' installed' : '');
        btnInstall.textContent = isInstalled ? I18N.skillsInstalled : I18N.skillsInstall;
        btnInstall.disabled    = isInstalled;

        const btnView = document.createElement('button');
        btnView.className   = 'skill-btn skill-btn-view';
        btnView.textContent = I18N.skillsViewOnSkillsSh;

        const feedbackEl = document.createElement('span');
        feedbackEl.className = 'skill-feedback hidden';

        btnInstall.addEventListener('click', function () {
          if (btnInstall.disabled) { return; }
          btnInstall.disabled    = true;
          btnInstall.textContent = I18N.skillsInstalling;
          feedbackEl.className   = 'skill-feedback hidden';
          vscode.postMessage({ type: 'installSkill', skill: skill });
        });

        btnView.addEventListener('click', function () {
          vscode.postMessage({ type: 'openSkillUrl', url: 'https://skills.sh/' + skill.id });
        });

        actions.appendChild(btnInstall);
        actions.appendChild(btnView);
        actions.appendChild(feedbackEl);

        li.appendChild(info);
        li.appendChild(actions);
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
      if (msg.type === 'installSuccess') {
        if (!installedIds.includes(msg.skillId)) { installedIds.push(msg.skillId); }
        const item = skillsList.querySelector('[data-skill-id="' + msg.skillId + '"]');
        if (item) {
          const btn = item.querySelector('.skill-btn-install');
          if (btn) {
            btn.textContent = I18N.skillsInstalled;
            btn.classList.add('installed');
          }
          const fb = item.querySelector('.skill-feedback');
          if (fb) {
            fb.textContent = I18N.skillsInstallOk;
            fb.className   = 'skill-feedback success';
          }
        }
      }
      if (msg.type === 'installError') {
        // Find the item that was being installed (last one with "Installing..." text)
        const items = skillsList.querySelectorAll('.skill-item');
        items.forEach(function (item) {
          const btn = item.querySelector('.skill-btn-install');
          if (btn && btn.disabled && btn.textContent === I18N.skillsInstalling) {
            btn.disabled    = false;
            btn.textContent = I18N.skillsInstall;
            const fb = item.querySelector('.skill-feedback');
            if (fb) {
              fb.textContent = I18N.skillsInstallErr + ' ' + msg.error;
              fb.className   = 'skill-feedback error';
            }
          }
        });
      }
    });
  }());
  `;
}
