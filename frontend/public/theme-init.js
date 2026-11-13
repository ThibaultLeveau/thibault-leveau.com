// Runs before the stylesheet and React to prevent a flash of the wrong theme.
;(() => {
  let preference = null
  try {
    preference = localStorage.getItem('personal-site-theme')
  } catch {
    // Browser privacy settings may make storage unavailable.
  }
  const theme = preference === 'light' || preference === 'dark'
    ? preference
    : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  document.documentElement.dataset.theme = theme
})()
