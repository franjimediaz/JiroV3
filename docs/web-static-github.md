# Comprobación de publicación con GitHub App

Configuración manual por instancia. No se crea ninguna App, instalación ni repositorio automáticamente.

Crear una GitHub App con permisos de repositorio **Metadata: Read-only** y **Contents: Read and write**, sin permisos de organización ni de cuenta, sin webhooks necesarios. Instalarla solo en el repositorio de esta instancia. El token de comprobación solicita Contents: read; el token temporal de publicación solicita Contents: write. Generar una clave privada RSA y custodiarla en el gestor de secretos del servidor.

Variables privadas del servidor (sin valores reales):

```dotenv
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_INSTALLATION_ID=
GITHUB_REPOSITORY_OWNER=
GITHUB_REPOSITORY_NAME=
GITHUB_PUBLICATION_BRANCH=
WEB_PUBLICATION_PREPARATION_SECRET=
```

La clave puede contener saltos reales o secuencias literales `\n`. `WEB_PUBLICATION_PREPARATION_SECRET` debe ser un secreto aleatorio privado de al menos 32 bytes, independiente de GitHub. Reiniciar el servidor tras configurar variables. Nunca utilizar NEXT_PUBLIC_, tokens personales ni guardar credenciales en Supabase. Mantener el reloj del servidor sincronizado.

La rama debe existir. El archivo fijo es `apps/web-static/content/publication.json`; su ausencia es una primera publicación válida. El navegador no decide repositorio, rama ni ruta. El token se limita al repositorio configurado y a contenidos/metadatos de lectura; solo vive en memoria durante la comprobación.

Se firma JWT RS256 y se realiza un POST exclusivamente al endpoint de autenticación para obtener cada token temporal. La comprobación usa GET. Tras una preparación firmada y una confirmación explícita, la publicación relee la rama y realiza un único PUT al archivo fijo `apps/web-static/content/publication.json`. La actualización incluye el SHA aprobado; GitHub 409/422 exige preparar de nuevo y no se reintenta. No se crean ramas ni se escriben otros archivos. El archivo admite hasta 1 MiB, igual que la exportación local.

La comparación ignora publicationId/publishedAt y el orden de claves/páginas, pero conserva el orden de componentes y slots. Informa cambios de tema aunque no haya rutas modificadas. Las imágenes solo se inspeccionan como referencias: no se descargan; los archivos locales deberán existir en apps/web-static/public al desplegar.

Pruebas con claves RSA efímeras y fetch/Supabase simulados; nunca usar credenciales reales. Configuración ausente produce CONFIG_ERROR, sin impedir compilar Jiro. GitHub confirma el commit, no el despliegue: Vercel u otro proveedor lo procesa por separado.

Documentación oficial: [JWT](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app), [installation tokens](https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token-for-an-app), [Contents API](https://docs.github.com/en/rest/repos/contents#get-repository-content).
