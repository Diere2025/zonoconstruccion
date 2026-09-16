# Whaticket propio: alcance y diagnóstico

Fecha: 15/09/2026. Base: código local de `whaticket-ui`, selección del usuario y recorrido previo de Whaticket comercial.

## Decisiones de alcance

Continuar sobre la implementación existente. No reconstruir desde cero ni copiar el código del servicio comercial. Conservar las cinco correcciones previas. Este documento prepara el desarrollo; no cambia funcionalidades ni despliega al servidor.

- Incluidas: 59 funciones; se mantienen los identificadores del selector original.
- Más adelante: 39 (saludos/despedidas por línea), 47 (encuestas), 61 (informes de satisfacción). La configuración de saludos que ya existe se conserva.
- Sin decidir: 32 (Facebook), 33 (Instagram), 34 (TikTok), 35 (Telegram), 37 (sandbox).
- Ninguna descartada definitivamente.

## Cómo interpretar el diagnóstico

- **Base:** existe lógica conectada en el frontend para el comportamiento principal. Requiere validar el flujo contra el backend antes de declararlo completo en producción.
- **Parcial:** hay una parte utilizable, pero faltan capacidades relevantes o existen defectos identificados.
- **Pendiente:** no se encontró implementación operativa local; puede existir un botón, texto o permiso ilustrativo.

Las llamadas a una API no demuestran que su implementación exista o que aplique permisos. No se encontró el código del backend en este workspace. No se usaron los accesos del Whaticket comercial para asumir acceso al servidor propio.

## Inventario de las 59 funciones elegidas

### Atención y conversaciones

| ID | Función | Estado | Evidencia y trabajo pendiente |
|---|---|---|---|
| 1 | Bandeja multiagente | Parcial | `App.tsx`, `chatStore.ts` y `TicketList.tsx`: lista, filtros de responsable y socket. Falta comprobar aislamiento y concurrencia con dos agentes reales. |
| 2 | Estados de atención | Parcial | Apertura, espera y cierre conectados. “Aplazados” usa `delayed as any`, fuera del tipo de estados; no hay flujo completo de aplazamiento. |
| 3 | Búsqueda y filtros | Parcial | Búsqueda y selección múltiple; corregida la carrera de consultas y agregada la carga paginada de conversaciones. La API recibe solo el inicio del rango de fechas. |
| 4 | Transferir y devolver chats | Base | `ChatArea.tsx`: cambio de departamento, devolución a pendientes y transferencia explícita a un usuario o a sin asignar. La UI conserva el chat si el servidor rechaza el cambio. |
| 5 | Posponer conversaciones | Pendiente | Hay una pestaña de aplazados; no se encontró acción con fecha de retorno ni persistencia. |
| 6 | Mantener conmigo | Base | Disponible dentro del menú de responsable del ticket; reutiliza la reasignación confirmada por el servidor. |
| 7 | Resolver con o sin despedida | Parcial | `updateTicketStatus` envía solo el estado. Falta elegir si enviar despedida y verificar el contrato del servidor. |
| 8 | Notas internas | Base | `ChatArea.tsx` y `sendMessage`: modo de nota y envío de `isPrivate`. Confirmar en backend que nunca sale al cliente. |
| 9 | Firma del agente | Base | El editor antepone el nombre del usuario y excluye notas internas. |
| 10 | Archivos adjuntos | Base | Selección múltiple, previsualización y envío multipart. Verificar errores de red, tipos y renovación de sesión en multimedia. |
| 11 | Grabar y reproducir audios | Base | MediaRecorder, cancelación, envío y reproductor con velocidad. Validar permisos de micrófono y formatos en el navegador de uso. |
| 12 | Transcribir audios | Pendiente | `WhatsAppAudioPlayer.tsx`: el botón solo muestra “Función de transcripción no disponible”. |
| 13 | Buscar y seleccionar mensajes | Pendiente | No se encontró búsqueda dentro del historial ni selección múltiple de mensajes. |
| 14 | Historial de atención | Parcial | Historial y carga de páginas implementados, con pruebas de orden y deduplicación. Falta verificar eventos de asignación/cierre y probar visualmente la conservación de scroll. |
| 15 | Abrir chats en popup | Pendiente | Hay iconografía de apertura externa en la lista, pero no se encontró `window.open` ni un flujo de popup. |
| 16 | Chat interno del equipo | Pendiente | `isInternalOnly` cambia el aspecto del botón; no hay vista, consultas ni canal interno separado. |
| 17 | Motivos de contacto | Pendiente | No hay catálogo ni captura del motivo al cerrar. |
| 18 | Notificaciones y no leídos | Parcial | Contadores y eventos presentes. `App.tsx` usa `/alert.mp3`, ausente en `public`; el manejador de mensajes no diferencia creación de actualización al contar no leídos. |

### Contactos y respuestas

| ID | Función | Estado | Evidencia y trabajo pendiente |
|---|---|---|---|
| 19 | Agenda de contactos | Parcial | `ContactsView.tsx` consulta, busca, crea, edita y elimina, con errores visibles. Falta paginación y abrir un chat desde el contacto. |
| 20 | Ficha del contacto | Parcial | `ContactDrawer.tsx` muestra datos y etiquetas. Falta edición y pestañas de mensajes/notas; la fecha mostrada como creación es la del ticket. |
| 21 | Etiquetas por color | Parcial | Lectura, presentación y filtros. No existe gestión de etiquetas ni asignación desde la ficha. |
| 22 | Importar y exportar contactos | Pendiente | Sin controles ni operaciones locales de importación/exportación. |
| 23 | Listas, tarjetas y columnas | Parcial | Usuarios permite lista/tarjetas; contactos tiene una cuadrícula fija. Falta configuración de columnas y consistencia entre módulos. |
| 24 | Respuestas rápidas con / | Base | `ChatArea.tsx`: búsqueda por atajo e inserción. La vista de biblioteca es de consulta; falta administración. |
| 25 | Respuestas con archivos y variables | Parcial | Inserción de adjuntos y sustitución de nombre, primer nombre y usuario. Falta editor de biblioteca y unificación del formateador del modal alternativo. |
| 26 | Respuestas por departamento | Pendiente | El modelo `QuickMessage` y el flujo activo no incluyen asignación o filtrado por departamentos. |
| 27 | Plantillas oficiales de WhatsApp | Pendiente | Sin módulo, modelo ni operaciones de aprobación de Meta. Las respuestas rápidas no equivalen a plantillas oficiales. |
| 28 | Plantillas enriquecidas | Pendiente | Sin editor de encabezados, idioma, botones, pie y variables de plantillas oficiales. |

### Canales

| ID | Función | Estado | Evidencia y trabajo pendiente |
|---|---|---|---|
| 29 | WhatsApp mediante QR | Base | `ConnectionsView.tsx`: creación, sesiones, QR, eventos y sondeo. Validar contratos del backend y vinculación en entorno controlado. |
| 30 | WhatsApp API Cloud | Pendiente | La tarjeta solo ejecuta `toast.info`; no inicia una integración. |
| 31 | WhatsApp con coexistencia | Pendiente | La tarjeta solo ejecuta `toast.info`; no hay autorización de Meta ni alta operativa. |
| 36 | Chat en nuestra web | Pendiente | La tarjeta solo muestra un aviso; no hay componente embebible ni canal conectado. |
| 38 | Administrar varias líneas | Parcial | Lista, edición, desconexión e importación de historial. “Asignar a todos” consulta una sola página y lanza actualizaciones sin esperar sus resultados; requiere corrección antes de usarlo como operación masiva. |

### Equipo y automatización

| ID | Función | Estado | Evidencia y trabajo pendiente |
|---|---|---|---|
| 40 | Departamentos | Parcial | `DepartmentsView.tsx` solo muestra áreas y saludos; falta creación, edición y gestión de reglas. |
| 41 | Chatbot por etapas | Pendiente | Sin editor de etapas ni lógica local de flujos. Los saludos de conexión no sustituyen el chatbot. |
| 42 | Asignación automática | Pendiente | No se encontró administración operativa de reglas en el frontend; verificar si el servidor actual tiene lógica reutilizable. |
| 43 | Reglas de disponibilidad | Pendiente | Sin control de disponibilidad y redistribución implementados en el flujo de atención. |
| 44 | Horarios de atención | Pendiente | Sin módulo de horarios generales o por departamento. |
| 45 | Ausencias programadas | Pendiente | Sin calendario, persistencia ni motor de aplicación. |
| 46 | Cierre por inactividad | Pendiente | Sin configuración o tarea de cierre local; confirmar capacidades del backend. |
| 48 | Límites de respuestas automáticas | Pendiente | Sin controles ni motor de límites para chatbot/IA. |
| 49 | IA con base de conocimiento | Pendiente | Sin módulo de fuentes, artículos o recuperación de conocimiento. |
| 50 | IA en la atención | Pendiente | Sin integración de inferencia, delegación ni generación de respuestas. |
| 51 | Usuarios e invitaciones | Parcial | `UsersView.tsx`: alta, edición y baja por API; faltan invitaciones. |
| 52 | Perfiles y permisos propios | Parcial | Editor visual guardado en `localStorage`; no se encontró consumo de esos permisos fuera de `UsersView.tsx`. No constituye autorización del servidor. |

### Seguimiento y campañas

| ID | Función | Estado | Evidencia y trabajo pendiente |
|---|---|---|---|
| 53 | Mensajes programados | Parcial | Creación por `/schedules` y subida de un adjunto. Falta listado/cancelación. Los controles de recurrencia no se envían en el payload. El fallo de subida posterior a crear puede dejar una programación incompleta. |
| 54 | Campañas masivas | Pendiente | No hay módulo ni flujo de campaña. |
| 55 | Destinatarios desde planilla | Pendiente | No hay importador/validador de destinatarios. |
| 56 | Enrutamiento de campañas | Pendiente | Sin reglas de asignación y estado ligadas a campañas. |
| 57 | Enriquecer contactos en campañas | Pendiente | Sin aplicación de etiquetas/campos durante importaciones de campañas. |

### Informes, seguridad e integración

| ID | Función | Estado | Evidencia y trabajo pendiente |
|---|---|---|---|
| 58 | Panel de atención | Pendiente | `App.tsx` no tiene módulo de informes. Los contadores de la lista no son estadísticas globales. |
| 59 | Tiempos de atención | Pendiente | Sin métricas de primera respuesta, resolución ni horario laboral. |
| 60 | Rendimiento y segmentación | Pendiente | Sin informes por agente, área, canal o motivo. |
| 62 | Informe de ausencias | Pendiente | Sin registro e informe de ausencias. |
| 63 | Exportar mensajes e informes | Pendiente | Sin flujo de exportación en el frontend. |
| 64 | Ocultar datos a agentes | Pendiente | Los datos se muestran directamente. La regla debe aplicarse también al contenido devuelto por la API. |
| 65 | Autenticación en dos factores | Pendiente | No hay enrolamiento ni desafío 2FA en el acceso propio. |
| 66 | API para integrar ERP | Parcial | Hay cliente HTTP del backend y una migración ERP que guarda `whaticket_link`. Eso no es todavía una integración de contactos/pedidos ni una API documentada de negocio. |
| 67 | Preferencias personales | Parcial | Sonido controlado en memoria, estilos para tema oscuro y avatar. Falta pantalla de perfil, idioma, tema y disponibilidad persistentes. |

## Base que se conserva

- React + TypeScript + Vite, estilos y distribución de pantallas.
- Stores de sesión y chats; cliente API y conexión socket.
- Componentes de chat, audio, adjuntos, respuestas rápidas y filtros.
- Gestión existente de usuarios y conexiones QR.
- Correcciones de respuestas fuera de orden, historial, pestaña Todos, departamentos múltiples y protección frente a pérdida de adjuntos programados.
- Pruebas en `tests/chat-regressions.test.cjs`: 10 aprobadas durante este relevamiento. No son pruebas de integración del servidor ni de permisos.

## Primer bloque de trabajo

### 1. Completar la atención diaria sobre la base actual

1. Revisar contrato del backend: endpoints, paginación, eventos socket y autorización por empresa/usuario.
2. Corregir reconexión y recuperación de la sala del chat; diferenciar mensajes nuevos de actualizaciones para no inflar no leídos.
3. Completar paginación de tickets, rango de fechas y búsqueda; validar con más de una página de resultados.
4. Completar transferencia a usuario, pendientes y aplazamiento según las capacidades reales del backend.
5. Completar agenda/ficha y biblioteca de respuestas rápidas con operaciones reales.
6. Ocultar o marcar como pendiente los controles ilustrativos hasta que tengan implementación; no mostrar confirmaciones de éxito por acciones no realizadas.

Criterios de aceptación: dos agentes de prueba, cambios rápidos de conversación, reconexión, más de dos páginas de historial y tickets, errores de red visibles, ausencia de duplicados y permisos comprobados en el servidor. No enviar mensajes a clientes para hacer las pruebas.

### 2. Equipo y seguridad

Perfiles persistidos y aplicados en el backend, aislamiento por empresa, ocultación de datos, 2FA, departamentos, asignación y horarios. Los permisos son un requisito previo a habilitar módulos administrativos a más usuarios.

### 3. Canales y automatización

WhatsApp oficial/coexistencia y chat web; luego chatbot, IA, programación y campañas. Confirmar capacidades reales del servidor antes de diseñar nuevos contratos. Recurrencia y múltiples adjuntos programados requieren soporte explícito; no simularlos en el frontend.

### 4. Informes e integración con ERP

Definir eventos y fechas necesarias para estadísticas, exportaciones y sincronización ERP. Aprovechar `whaticket_link` como referencia existente, sin considerarlo integración completa.

## Integración y pendientes de acceso

El directorio `whaticket-ui/` aparece completo como no seguido por Git en la rama `main`. Antes del primer merge hay que incorporar esta base a control de versiones y separar cambios de otros proyectos presentes en el workspace. En esta revisión no se creó un commit, no se mezclaron cambios ajenos y no se desplegó nada.

Pendiente localizar el código del backend propio: otro repositorio, ruta local o checkout del servidor. Con su ubicación se podrá completar la auditoría de persistencia, seguridad y tareas programadas. Mientras tanto, los estados de este documento describen exclusivamente el frontend local.
