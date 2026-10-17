# Proveedores de direcciones

`AddressInput` usa el contrato neutral `search` / `resolve` mediante `POST /api/address`.
`getAddressProvider()` selecciona exclusivamente en servidor el proveedor configurado.
Los tipos, el selector, Google, Geoapify y la atribución genérica de la UI ya existían;
esta revisión completa la reutilización de autocomplete, pruebas y documentación.

## Configuración

En `apps/web/.env.local` o en el entorno del servidor:

```dotenv
ADDRESS_PROVIDER=geoapify
GEOAPIFY_API_KEY=tu_clave
```

Alternativa:

```dotenv
ADDRESS_PROVIDER=google
GOOGLE_PLACES_API_KEY=tu_clave
```

Reiniciar la aplicación tras cambiar la configuración. Sin `ADDRESS_PROVIDER` se usa
`google`, por compatibilidad. Un valor desconocido o la ausencia de la clave elegida
produce un error de configuración 503. No se necesita la clave del otro proveedor.
Estas variables nunca deben llevar el prefijo `NEXT_PUBLIC_`. No hay fallback a Google.

## Geoapify

Documentación oficial consultada el 17 de octubre de 2026:

- [Autocomplete](https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/):
  `GET https://api.geoapify.com/v1/geocode/autocomplete`, con `text`, `format=json`,
  `limit=7`, `lang=es`, `apiKey` y, si hay países, `filter=countrycode:es,pt`.
- [Place Details](https://apidocs.geoapify.com/docs/place-details/):
  `GET https://api.geoapify.com/v2/place-details`, con `id`, `features=details`,
  `lang=es` y `apiKey`, únicamente cuando no está disponible el resultado anterior.

Autocomplete ya incluye los componentes y las coordenadas. Se guarda únicamente el
`AddressValue` normalizado en una caché de memoria del proceso: máximo 256 entradas,
validez de cinco minutos, separadas por clave del proveedor e identificador. Las
entradas caducadas se eliminan al consultar su ID o insertar nuevos resultados; no
se sirven después de caducar. No hay infraestructura ni caché de búsquedas. El
navegador recibe solo ID, etiquetas y atribución, nunca el payload completo.

`search` + `resolve` hacen **una petición externa** si la misma instancia conserva
el resultado. Hacen **dos** si hay reinicio, caducidad, expulsión o cambio de instancia:
Place Details recupera el ID oficial sin confiar en objetos enviados por el cliente.
Cada búsqueda adicional por escritura realiza su propia petición de autocomplete.
Geoapify ignora `sessionId`; no lo transmite como token ficticio.

Se priorizan resultados con calle y se omiten países y estados; se conserva el orden
de relevancia dentro de cada grupo. No se fija `type=street` porque restringiría la
búsqueda a calles, en lugar de permitir también edificios y direcciones completas.
La restricción geográfica se aplica en Geoapify, no en el navegador.

| Geoapify | AddressValue |
| --- | --- |
| formatted (o address_line1) | formatted |
| street | street |
| housenumber | number |
| postcode | postalCode |
| city, town o village; county como último recurso | city |
| county; state como alternativa | province |
| country | country |
| country_code en mayúsculas | countryCode |
| lat / lon | lat / lng, salvo saveCoordinates=false |
| constante geoapify | provider |
| place_id | providerId |

Los componentes pueden faltar según la cobertura y el tipo de resultado. La división
administrativa varía por país; `province` prioriza county sobre state. La selección
no garantiza que exista número de portal ni constituye una validación postal.

## Compatibilidad y seguridad

Google conserva autocomplete, Place Details, session tokens y Field Masks. El valor
persistido sigue siendo `AddressValue`, con proveedor opcional para datos antiguos.
La entrada manual guarda `{ formatted, provider: "manual" }` sin resolver con un
proveedor; escribir en el buscador puede generar autocomplete antes de pulsar
«Usar texto», como en el comportamiento existente.

Se mantienen autenticación, comprobación de origen, rate limit de 60 peticiones por
minuto por usuario/IP, límite de cuerpo de 2048 caracteres, consulta de 3–200,
ID de hasta 500, validación de sesión/países, abort y timeout de ocho segundos.
Los logs de operación indican proveedor sin dirección ni clave. Los errores HTTP
de Geoapify se convierten al error normalizado de la API, sin cambiar de proveedor.

## Atribución

Según las [condiciones de Geoapify](https://www.geoapify.com/terms-and-conditions/)
y su [página de precios](https://www.geoapify.com/pricing/), el plan gratuito requiere
atribución de Geoapify y de las fuentes de datos. Geoapify pide un enlace normal
«Powered by Geoapify» cerca de la información suministrada. Los requisitos de las
fuentes siguen siendo aplicables según los datos utilizados y el plan contratado.

El desplegable actual muestra enlaces a Geoapify y a
[© OpenStreetMap contributors](https://www.openstreetmap.org/copyright) mediante
metadatos genéricos; `AddressInput` no contiene condiciones por proveedor.
La atribución del desplegable no se persiste en `AddressValue`: si se publican estos
datos en otras vistas, mapas o exportaciones, esas superficies deben incluir la
atribución aplicable también. No se ha añadido un sistema global de atribución.

## Verificación

```sh
node --test scripts/address-field.test.mjs scripts/address-providers.test.mjs
pnpm --filter web check-types
pnpm --filter web lint
pnpm --filter web build
git diff --check
```

Las pruebas utilizan respuestas simuladas, sin consumo de cuota ni claves reales.
