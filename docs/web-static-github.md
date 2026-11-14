# Comprobación de publicación con GitHub App

Configuración manual por instancia. No se crea ninguna App, instalación ni repositorio automáticamente.

Crear una GitHub App con permisos de repositorio **Metadata: Read-only** y **Contents: Read-only**, sin permisos de organización ni de cuenta, sin webhooks necesarios. Instalarla solo en el repositorio de esta instancia. No habilitar escritura. Generar una clave privada RSA y custodiarla en el gestor de secretos del servidor.

Variables privadas del servidor (sin valores reales):

```dotenv
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_INSTALLATION_ID=
GITHUB_REPOSITORY_OWNER=
GITHUB_REPOSITORY_NAME=
GITHUB_PUBLICATION_BRANCH=
```

La clave puede contener saltos reales o secuencias literales `\n`. Reiniciar el servidor tras configurar variables. Nunca utilizar NEXT_PUBLIC_, tokens personales ni guardar credenciales en Supabase. Mantener el reloj del servidor sincronizado.

La rama debe existir. El archivo fijo es `apps/web-static/content/publication.json`; su ausencia es una primera publicación válida. El navegador no decide repositorio, rama ni ruta. El token se limita al repositorio configurado y a contenidos/metadatos de lectura; solo vive en memoria durante la comprobación.

Se firma JWT RS256 y se realiza un POST exclusivamente al endpoint de autenticación para obtener el token temporal. Todas las operaciones sobre el repositorio son GET, sin redirecciones ni URLs de descarga externas. Se fija la lectura al commit de la rama comprobada. No hay métodos de escritura, commits, pushes ni cambios del archivo remoto. El archivo admite hasta 1 MiB, igual que la exportación local.

La comparación ignora publicationId/publishedAt y el orden de claves/páginas, pero conserva el orden de componentes y slots. Informa cambios de tema aunque no haya rutas modificadas. Las imágenes solo se inspeccionan como referencias: no se descargan; los archivos locales deberán existir en apps/web-static/public al desplegar.

Pruebas con claves RSA efímeras y fetch/Supabase simulados; nunca usar credenciales reales. Configuración ausente produce CONFIG_ERROR, sin impedir compilar Jiro.

Documentación oficial: [JWT](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-a-json-web-token-jwt-for-a-github-app), [installation tokens](https://docs.github.com/en/rest/apps/apps#create-an-installation-access-token-for-an-app), [Contents API](https://docs.github.com/en/rest/repos/contents#get-repository-content).
