# VSCode Extension: Claude Code Usage Indicator

> Genera una extensión de VSCode que muestre el uso actual de la suscripción de Claude Code directamente en la Status Bar.

---

## Objetivo

Crear una extensión de VSCode que muestre en la **Status Bar** (barra inferior) dos indicadores del uso actual de la suscripción de Claude Code:

```
⬛⬛⬛⬜⬜⬜⬜⬜⬜⬜ Session 15% · Resets in 3h    ⬛⬛⬜⬜⬜⬜⬜⬜⬜⬜ Weekly 26% · Resets in 3d
```

En la primera fase, mostrar solo los valores en texto plano sin barra de progreso:

```
$(clock) Session: 15% · 3h left    $(calendar) Weekly: 26% · 3d left
```

---

## Stack y entorno

- **Lenguaje:** TypeScript
- **Entorno:** Node.js (VSCode Extension Host)
- **Gestor de paquetes:** pnpm
- **Target OS inicial:** macOS (usar Keychain para credenciales)
- **Compatibilidad futura:** Windows y Linux (ver sección de credenciales)

---

## Cómo obtener los datos de uso

### Endpoint oficial (reverse-engineered)

Claude Code consulta internamente este endpoint para obtener el uso:

```
GET https://api.anthropic.com/api/oauth/usage
```

**Headers requeridos:**
```
Accept: application/json, text/plain, */*
Content-Type: application/json
User-Agent: claude-code/2.0.32
Authorization: Bearer {ACCESS_TOKEN}
anthropic-beta: oauth-2025-04-20
```

**Respuesta esperada:**
```json
{
  "five_hour": {
    "utilization": 15.0,
    "resets_at": "2026-03-03T12:59:59.943648+00:00"
  },
  "seven_day": {
    "utilization": 26.0,
    "resets_at": "2026-03-06T03:59:59.943679+00:00"
  },
  "seven_day_opus": {
    "utilization": 0.0,
    "resets_at": null
  }
}
```

> `utilization` es un número de 0 a 100 que representa el porcentaje de uso.

---

### Cómo obtener el Access Token

Claude Code almacena las credenciales OAuth en el sistema operativo. El token se encuentra bajo la clave:

```
"Claude Code-credentials"
```

El valor es un JSON con esta estructura:
```json
{
  "claudeAiOauth": {
    "accessToken": "sk-ant-oat01-...",
    "refreshToken": "...",
    "expiresAt": 1234567890,
    "scopes": ["..."],
    "subscriptionType": "pro"
  }
}
```

#### macOS — Keychain
```bash
security find-generic-password -s "Claude Code-credentials" -w
```
Ejecutar con `child_process.execSync()` desde la extensión.

#### Linux — Secret Service / archivo local
Intentar primero con `secret-tool lookup service "Claude Code-credentials"`.
Si falla, buscar en `~/.claude/credentials.json` o `~/.config/claude/credentials.json`.

#### Windows — Credential Manager / archivo local
Intentar con `cmdkey /list` o buscar en `%APPDATA%\claude\credentials.json`.

> Si ninguno de los métodos automáticos funciona, la extensión debe pedir al usuario que pegue su token manualmente desde la configuración de VSCode (`settings.json`).

---

## Estructura del proyecto

```
claude-usage-indicator/
├── src/
│   ├── extension.ts          # Punto de entrada, activa/desactiva la extensión
│   ├── statusBar.ts          # Lógica de creación y actualización de los items
│   ├── usageApi.ts           # Fetch al endpoint de Anthropic
│   ├── credentials.ts        # Lectura del token por OS
│   └── utils.ts              # Formateo de tiempo restante, porcentajes, barras
├── package.json
├── tsconfig.json
└── .vscodeignore
```

---

## Comportamiento esperado de los Status Bar Items

### Item 1 — Sesión (5h rolling window)
- **Posición:** derecha de la Status Bar (`vscode.StatusBarAlignment.Right`, prioridad 100)
- **Texto fase 1:** `$(clock) Session: 15% · 3h left`
- **Texto fase 2:** `$(clock) ██░░░░░░░░ 15% · 3h left`
- **Tooltip:** `Claude Code — Session Usage (5h rolling window)
Resets at: HH:MM local time`
- **Color de advertencia:** Usar `statusBarItem.warningBackground` cuando utilization >= 80%
- **Color de error:** Usar `statusBarItem.errorBackground` cuando utilization >= 95%

### Item 2 — Semanal (7 días)
- **Posición:** derecha de la Status Bar (`vscode.StatusBarAlignment.Right`, prioridad 99)
- **Texto fase 1:** `$(calendar) Weekly: 26% · 3d left`
- **Texto fase 2:** `$(calendar) ██░░░░░░░░ 26% · 3d left`
- **Tooltip:** `Claude Code — Weekly Usage (7-day rolling window)
Resets at: DDD DD MMM`
- **Color de advertencia:** Igual que el de sesión

### Barra de progreso ASCII (Fase 2)
Usar caracteres Unicode para simular la barra:
- Relleno: `█` o `■`
- Vacío: `░` o `□`
- Longitud: 10 caracteres
- Ejemplo al 26%: `███░░░░░░░`

```typescript
function buildProgressBar(percent: number, length = 10): string {
  const filled = Math.round((percent / 100) * length);
  return "█".repeat(filled) + "░".repeat(length - filled);
}
```

---

## Lógica de actualización

- **Intervalo de polling:** cada **60 segundos** (configurable via settings)
- **Al activar la extensión:** fetch inmediato
- **Al hacer click en un item:** forzar refresh manual
- **Caché:** guardar última respuesta válida, mostrarla si el fetch falla (con indicador `~`)
- **Si el token es inválido o no se encuentra:** mostrar `$(error) Claude: No auth` con color de error

---

## Configuración de la extensión (`contributes.configuration`)

Añadir estas opciones en `package.json` para que el usuario pueda configurarlas en `settings.json`:

```json
"claudeUsage.refreshInterval": {
  "type": "number",
  "default": 60,
  "description": "Intervalo de actualización en segundos"
},
"claudeUsage.manualToken": {
  "type": "string",
  "default": "",
  "description": "Token de acceso manual (si la lectura automática falla)"
},
"claudeUsage.showProgressBar": {
  "type": "boolean",
  "default": false,
  "description": "Mostrar barra de progreso ASCII en la Status Bar"
},
"claudeUsage.warningThreshold": {
  "type": "number",
  "default": 80,
  "description": "Porcentaje a partir del cual activar color de advertencia"
}
```

---

## package.json — campos clave

```json
{
  "name": "claude-usage-indicator",
  "displayName": "Claude Code Usage",
  "description": "Shows Claude Code subscription usage in the Status Bar",
  "version": "0.0.1",
  "engines": { "vscode": "^1.85.0" },
  "categories": ["Other"],
  "activationEvents": ["onStartupFinished"],
  "main": "./out/extension.js",
  "contributes": {
    "commands": [
      {
        "command": "claudeUsage.refresh",
        "title": "Claude Usage: Refresh now"
      }
    ]
  }
}
```

---

## Orden de implementación recomendado

1. **Scaffolding:** Inicializar el proyecto con `yo code` o manualmente con `pnpm init` + tsconfig
2. **`credentials.ts`:** Implementar lectura del token (macOS primero, fallback a manual)
3. **`usageApi.ts`:** Implementar el fetch al endpoint con los headers correctos, tipado con la interfaz `UsageLimits`
4. **`utils.ts`:** Funciones de formato (`formatTimeLeft`, `buildProgressBar`, `getColorByUsage`)
5. **`statusBar.ts`:** Crear los dos `StatusBarItem`, lógica de actualización y polling
6. **`extension.ts`:** `activate()` que inicializa todo, `deactivate()` que limpia el intervalo y los items
7. **Probar en Extension Development Host** con `F5`
8. **Fase 2:** Activar barra de progreso ASCII via el setting `showProgressBar`

---

## Notas y consideraciones

- El endpoint `https://api.anthropic.com/api/oauth/usage` **no es oficial ni documentado** — es reverse-engineered del tráfico de red de Claude Code. Puede cambiar sin previo aviso.
- Si `resets_at` es `null`, no mostrar el tiempo restante.
- El campo `utilization` va de 0 a 100 (no es decimal 0-1).
- La extensión **no debe almacenar ni loggear el token** en ningún fichero.
- Para evitar rate limiting en el endpoint, no bajar el intervalo de polling por debajo de 30 segundos.
- Referencia del endpoint descubierta por: https://codelynx.dev/posts/claude-code-usage-limits-statusline

---

## Referencias

- [VSCode Extension API — Getting Started](https://code.visualstudio.com/api/get-started/your-first-extension)
- [VSCode Status Bar UX Guidelines](https://code.visualstudio.com/api/ux-guidelines/status-bar)
- [VSCode StatusBarItem API](https://code.visualstudio.com/api/references/vscode-api#StatusBarItem)
- [Reverse-engineered usage endpoint (Codelynx)](https://codelynx.dev/posts/claude-code-usage-limits-statusline)
- [Claude Code local stats cache (~/.claude/stats-cache.json)](https://www.reddit.com/r/ClaudeAI/comments/1rcamhu/)
