function installMobileLayoutHotfix() {
  if (document.querySelector('#reactusMobileLayoutHotfix')) return;
  const style = document.createElement('style');
  style.id = 'reactusMobileLayoutHotfix';
  style.textContent = `
    @media(max-width:760px){
      body{padding-bottom:env(safe-area-inset-bottom)!important}
      #reactusMobileNav{display:none!important}
      #calendarOverview,.panel{position:relative;overflow:visible}
      #calendarSettingsMount{width:100%;min-width:0}
      .reactus-calendar-settings-fold{width:100%;min-width:0}
      .reactus-calendar-settings-fold .calendar-settings-body{min-width:0}
      .calendar-settings-block,.calendar-settings-row,.calendar-setting-card{max-width:100%;min-width:0}
      .calendar-settings-row>label{min-width:0!important;width:100%}
      .calendar-settings-row input,.calendar-settings-row select{width:100%;min-width:0}
    }
  `;
  document.head.append(style);
  document.querySelector('#reactusMobileNav')?.remove();
}

installMobileLayoutHotfix();
