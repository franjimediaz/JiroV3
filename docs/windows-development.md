# Desarrollo de Jiro en Windows

## Instalación y arranque

Usar Node **22 LTS** (también indicado en `.nvmrc`) y pnpm **10.0.0**
(`packageManager`). Verificar `node --version`, `pnpm --version` y `Get-Command node,pnpm`
en la misma terminal. Después de cambiar Node, abrir una terminal nueva. No se activa
`engine-strict`, para no bloquear gestores pnpm independientes que usan su propio Node.
El lanzador comprueba la versión de Node que ejecuta realmente el desarrollo.

Se recomienda un checkout corto fuera de carpetas sincronizadas, por ejemplo
`C:\src\JiroV3`. OneDrive, antivirus y editores pueden mantener archivos abiertos;
ningún script puede garantizar que Windows permita eliminar un archivo bloqueado.
No se modifican políticas de Windows, permisos, antivirus ni configuración de OneDrive.
Si se crea otro checkout, copiar los `.env.local` necesarios de forma privada; no
copiar `node_modules`, `.next` ni `.turbo`. El repositorio actual no se mueve automáticamente.

```powershell
pnpm install --frozen-lockfile
pnpm run dev:check
pnpm run dev
```

El flujo de desarrollo es:

1. `predev` verifica los puertos 3000 (web) y 3001 (docs).
2. Solo detiene por PID un proceso Node identificado como Next de este repositorio.
   Protege su PID, el padre y los ancestros; comprueba otra vez el propietario antes
   de ejecutar `taskkill /PID ... /T /F`. Nunca utiliza `/IM node.exe`.
3. Espera a que desaparezcan los listeners. Un proceso ajeno, permisos insuficientes
   o un fallo de inspección detienen el arranque con un error, en vez de ocultarlo.
4. `dev.mjs` prueba el CLI local de Turbo con `--version`. Si funciona, ejecuta
   `turbo run dev --ui=stream`. Si falta o su binario no arranca, anuncia el problema
   y ejecuta los CLI de Next para web y docs, con los puertos de sus scripts actuales.

`.npmrc` habilita explícitamente los hooks pre/post de pnpm. El puerto 3002 no se
libera: ningún workspace tiene configurado un servidor allí. No se limpia ni se
reinstala nada durante `dev`. No se borran locks de Next en uso.

El modo directo cubre los dos workspaces que actualmente tienen `dev`; si se añaden
otros, actualizar el lanzador. No sustituye el grafo de tareas ni la caché de Turbo
para build/lint. No cambia automáticamente al modo directo después de arrancar
Turbo: un error de una aplicación debe seguir siendo visible, sin duplicar servidores.

```powershell
pnpm run dev --direct    # Forzar el modo directo
pnpm run dev:stop        # Parar únicamente Next reconocido en los puertos conocidos
```

Ctrl+C y SIGTERM detienen los hijos del lanzador; si un workspace termina se detiene
el resto. En Windows se termina el árbol del PID concreto. Cerrar forzosamente la
terminal, cortar la alimentación o un bloqueo del sistema puede impedir la limpieza;
el siguiente predev vuelve a inspeccionar los puertos. En otros sistemas, los puertos
ocupados se notifican y deben liberarse manualmente, sin intentar adivinar propietarios.

## Limpieza explícita de una instalación parcial

Primero cerrar las terminales que estén ejecutando `dev`, builds o instalaciones.
La limpieza intenta parar los listeners Next reconocidos, pero no mata procesos
Node arbitrarios ni herramientas que estén usando archivos sin escuchar en esos puertos.

```powershell
pnpm run clean:install --dry-run
pnpm run clean:install
pnpm install --frozen-lockfile
pnpm run dev
```

Si pnpm no puede ejecutar scripts por una instalación dañada:

```powershell
node scripts/clean-install.mjs --dry-run
node scripts/clean-install.mjs
```

La limpieza elimina `node_modules` y `.turbo` del root, y `node_modules`, `.next` y
`.turbo` encontrados bajo apps, packages y pdf-service. No elimina fuentes, `.env`,
lockfile ni store global de pnpm. No instala automáticamente.

Utiliza `fs.rm` recursivo con `force`, seis reintentos y espera incremental de 250 ms.
Node reintenta `EPERM`, `EBUSY` y `ENOTEMPTY`, entre otros errores transitorios;
`ENOENT` significa que la ruta ya no existe y se acepta. Se usan rutas extendidas
de Windows (`toNamespacedPath`), sin depender de `Remove-Item`.
Se comprueban los límites del repositorio y los padres reales de cada destino;
no se recorren junctions de workspaces. Los errores persistentes se enumeran y
producen salida no cero. Es seguro volver a ejecutar tras una limpieza parcial.

Si persisten bloqueos, cerrar las herramientas que usan esas rutas y pausar la
sincronización de OneDrive. Si siguen apareciendo, reiniciar Windows y volver a
limpiar antes de abrir servidores. Una ubicación corta y no sincronizada reduce
estos problemas, pero no repara por sí sola una instalación incompleta.

`spawnSync ... turbo.exe UNKNOWN` no identifica una causa única: puede corresponder
a un binario ausente, dañado o bloqueado. El diagnóstico no afirma que OneDrive sea
la causa. No se descarga ningún ejecutable fuera del lockfile ni se desactiva seguridad.

`pw:install` ahora configura `PLAYWRIGHT_BROWSERS_PATH` mediante Node, compatible
con PowerShell y otros shells, sin asignación POSIX `VAR=valor comando`.

## Pruebas y referencias

```powershell
node --test scripts/windows-dev.test.mjs
node scripts/clean-install.mjs --dry-run
pnpm run dev:check
git diff --check
```

Las pruebas borran únicamente directorios temporales creados por ellas; cubren
puertos exactos, ancestros, procesos ajenos, limpieza parcial, junctions y fallos de Turbo.

- [Node 22: fs.rm y reintentos](https://nodejs.org/download/release/latest-jod/docs/api/fs.html)
- [pnpm 10: hooks pre/post](https://github.com/pnpm/pnpm.io/blob/main/versioned_docs/version-10.x/settings/_enablePrePostScripts.mdx)
- [Lanzador oficial de Turbo](https://github.com/vercel/turborepo/blob/main/packages/turbo/bin/turbo)
