# Web Static — STEP 11

El manifiesto admite opcionalmente `header` y Web Static lo renderiza en todas las páginas, salvo cuando la página ya contiene un componente `Header`. Los manifiestos anteriores siguen siendo válidos.

El editor permite configurar visualmente un `Header` dentro de cada página. La configuración global queda preparada en el contrato y en el render público, pero no se persiste desde Jiro: el modelo actual solo guarda borradores por página en `web_pages` y no existe un almacenamiento semánticamente correcto para ajustes del sitio. Implementar ese guardado requiere aprobar un contrato de persistencia global; no se reutiliza una columna ni se crea una tabla encubierta.
