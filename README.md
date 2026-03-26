# Camera Embed (статичное приложение)

Мини‑приложение камеры для вставки в `iframe`: запрос доступа к камере → превью → снимок → лоадер → **на экране остаётся только картинка**.

## Запуск локально

Доступ к камере работает только в **HTTPS** или на **localhost**.

```bash
cd camera-embed
python3 -m http.server 5173
```

Открыть: `http://localhost:5173`

## Встраивание (iframe)

```html
<iframe
  src="https://your-domain.example/camera-embed/"
  allow="camera; fullscreen; clipboard-write"
  style="border:0;width:360px;height:520px;border-radius:16px;overflow:hidden"
></iframe>
```

## Получить картинку в родителе (postMessage)

Приложение отправляет событие в родительское окно после снимка:

```js
window.addEventListener("message", (event) => {
  if (!event?.data || event.data.type !== "camera:image") return;
  const { dataUrl, mimeType } = event.data;
  // dataUrl содержит готовую картинку (обычно image/jpeg)
});
```

## Параметры URL

- `facing=user|environment` — какая камера по умолчанию
- `postMessage=0` — отключить отправку `postMessage`
- `targetOrigin=https://host.example` — ограничить origin для `postMessage` (по умолчанию `*`)
- `minLoadingMs=650` — минимальная длительность лоадинга
- `jpegQuality=0.92` — качество JPEG (0.5..0.98)
