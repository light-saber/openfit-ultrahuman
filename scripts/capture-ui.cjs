'use strict'

const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

app.disableHardwareAcceleration()

app.whenReady().then(async () => {
  const outputDirectory = path.join(__dirname, '..', '.artifacts')
  fs.mkdirSync(outputDirectory, { recursive: true })
  const window = new BrowserWindow({
    width: 1440,
    height: 930,
    show: false,
    backgroundColor: '#080c11',
    webPreferences: { sandbox: true, contextIsolation: true },
  })
  await window.loadURL(process.env.PULSEBOARD_CAPTURE_URL || 'http://127.0.0.1:5173/')
  await new Promise((resolve) => setTimeout(resolve, 1200))

  async function capture(name) {
    const image = await window.webContents.capturePage()
    const output = path.join(outputDirectory, `${name}.png`)
    fs.writeFileSync(output, image.toPNG())
    console.log(output)
  }

  async function navigate(label, name) {
    await window.webContents.executeJavaScript(`
      [...document.querySelectorAll('button')]
        .find((button) => button.textContent.includes(${JSON.stringify(label)}))?.click()
    `)
    await new Promise((resolve) => setTimeout(resolve, 350))
    await capture(name)
  }

  await capture('dashboard')
  await navigate('Attività', 'activity')
  await navigate('Salute', 'health')
  await navigate('Sonno', 'sleep')
  await navigate('Corpo', 'body')
  await navigate('Dati', 'data')
  await window.webContents.executeJavaScript(`
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent.includes('Impostazioni'))?.click()
  `)
  await new Promise((resolve) => setTimeout(resolve, 180))
  await capture('settings')
  await window.webContents.executeJavaScript(`document.querySelector('[data-slot="dialog-close"]')?.click()`)
  window.setSize(430, 850)
  await window.loadURL(process.env.PULSEBOARD_CAPTURE_URL || 'http://127.0.0.1:5173/')
  await new Promise((resolve) => setTimeout(resolve, 600))
  await capture('mobile')
  await navigate('Attività', 'mobile-activity')
  await navigate('Salute', 'mobile-health')
  await navigate('Sonno', 'mobile-sleep')
  await navigate('Corpo', 'mobile-body')
  await navigate('Dati', 'mobile-data')
  window.destroy()
  app.quit()
})
