# Manual del Profesor — PadletLocal

Guía completa para instalar, iniciar, moderar y aprovechar todas las herramientas docentes de **PadletLocal** en red local (LAN / Wi-Fi).

---

## 1. Inicio rápido con el Panel de Control (`PadletLocal.bat`)

Haz **doble clic** en **`PadletLocal.bat`** en la carpeta del proyecto. Se abrirá el panel de control con el estado actual del servidor:

| Opción | Qué hace |
| :---: | :--- |
| **`[1]` Iniciar servidor** | Genera/verifica los certificados HTTPS locales, pregunta si deseas confiar el certificado en tu equipo y arranca el servidor en segundo plano. |
| **`[2]` Detener servidor** | Detiene de forma segura únicamente el servidor de PadletLocal. |
| **`[3]` Reiniciar servidor** | Detiene y vuelve a iniciar el servidor (útil después de cambiar PIN o puertos). |
| **`[4]` Abrir en navegador (HTTPS)** | Abre automáticamente el panel en tu navegador usando la dirección HTTPS segura. |
| **`[5]` Cambiar PIN / Puertos** | Permite cambiar el **PIN del Profesor** (por defecto `1234`) y los puertos HTTP (`3000`) / HTTPS (`3443`). |
| **`[6]` Ver registro (log)** | Muestra las últimas líneas de actividad y errores del servidor. |
| **`[7]` Permitir puertos en Firewall** | Solicita permiso de Administrador para abrir los puertos TCP en redes privadas de Windows. |
| **`[8]` Instalar certificado CA en este PC** | Instala `PadletLocal Root CA` en Windows para que tu navegador abra HTTPS con candado seguro **sin pantalla roja**. |
| **`[0]` Salir del panel** | Cierra el panel y te pregunta si deseas detener el servidor o dejarlo funcionando en segundo plano. |

---

## 2. Conectar a los participantes (sin pantalla roja)

1. Con el servidor activo, abre PadletLocal y haz clic en el botón **Red local** en la barra superior.
2. Comparte con el grupo:
   - La dirección **HTTPS** (ej. `https://192.168.x.x:3443`) o el **código QR** en pantalla.
3. **Para que a los usuarios no les aparezca la advertencia roja de certificado (solo se hace 1 vez por equipo):**
   - **Equipos Windows (1 clic, sin permisos de administrador):** pide a los usuarios abrir `http://<TU-IP>:3000/cert/Instalar-Certificado-Windows.bat`, ejecutar el archivo y pulsar **Sí**. Luego se abrirá HTTPS automáticamente con candado seguro.
   - **Android / iPhone / Mac:** pueden descargar `http://<TU-IP>:3000/cert/PadletLocal-RootCA.crt` (también disponible desde el botón **Red local** o el aviso HTTP superior) e instalarlo como certificado de confianza.
   - **Alternativa rápida sin instalar nada:** al abrir HTTPS, hacer clic en *"Configuración avanzada"* → *"Continuar al sitio"*.
4. **Si otros equipos no pueden abrir la página:**
   - Verifica que todos estén en el **mismo Wi-Fi o red local**.
   - Ejecuta la opción **`[7]` Permitir puertos en Firewall de Windows** dentro de `PadletLocal.bat`.

---

## 3. Activar el Modo Profesor

1. En la barra superior de la aplicación web, haz clic en el botón **Profesor**.
2. Ingresa el **PIN del Profesor** (por defecto `1234`, visible también en `PadletLocal.bat`).
3. El botón cambiará a verde (**Panel Profesor**) y se habilitarán todas las funciones docentes en las tarjetas y en el panel de control.
4. Para salir del modo docente en cualquier momento, abre **Panel Profesor** → **Salir del modo Profesor**.

---

## 4. Publicar y gestionar Temas de Tareas

Dentro de **Panel Profesor → pestaña `📝 Siguiente Tarea`**:

1. Ingresa el **Título de la tarea** y, si deseas, una **etiqueta u hora de entrega** (ej. *"Entregar antes de las 12:30"*).
2. Escribe o **pega directamente** las instrucciones, pasos o enlaces (los enlaces se vuelven clicables automáticamente).
3. Opcionalmente, adjunta una **imagen de referencia** haciendo clic, arrastrándola o pegando una captura con **`Ctrl+V`**.
4. Mantén marcadas las casillas:
   - **Mostrar fijada arriba del panel**: aparece en la franja superior de **Temas de Tareas** en formato pequeño; cuando un usuario hace clic en ella, crece para mostrar todas las instrucciones completas.
   - **Notificar con alerta a todos los conectados**: envía un aviso inmediato con sonido a todos los dispositivos.
5. **Tareas anteriores:** cada vez que publicas una nueva tarea, la anterior pasa al historial y sigue visible como tarjeta pequeña clicable. También puedes recargar cualquier tarea anterior con el botón **Cargar**.
6. Usa **Quitar tarea actual** para archivar la tarea activa.

---

## 5. Enviar Notificaciones en Tiempo Real

Dentro de **Panel Profesor → pestaña `📢 Notificar`**:

- Puedes elegir uno de los **avisos rápidos de 1 clic** (*Quedan 5 min*, *Atención al frente*, *Suban su trabajo*, *Volvemos en breve*) o redactar un mensaje personalizado.
- Selecciona el nivel de alerta:
  - 🔵 **Información general**
  - 🟣 **Nueva tarea / entrega**
  - 🟠 **Atención / urgente**
  - 🟢 **Receso / descanso**
- Activa **Reproducir tono de alerta** para emitir un sonido en los equipos conectados (funciona sin internet).
- Todos los avisos quedan guardados en la **campana de notificaciones** de la barra superior.

---

## 6. Programar Recesos y Temporizadores con Countdown

Dentro de **Panel Profesor → pestaña `⏱ Recesos y Timers`**:

1. Elige el tipo (**☕ Receso / Descanso** o **⏱ Tiempo de actividad / tarea**), una etiqueta y un mensaje opcional.
2. **Modo A — Iniciar ahora:** elige un botón rápido (`5`, `10`, `15`, `20`, `30 min`) o escribe los minutos y pulsa **Iniciar countdown ahora**.
3. **Modo B — Programar a una hora:** selecciona la **hora de inicio** (ej. `11:30`) y la duración.
   - Todos verán arriba un aviso *"☕ Receso a las 11:30 (en MM:SS)"*.
   - Al llegar la hora exacta, el servidor inicia el receso automáticamente y notifica a todos con sonido.
   - Al llegar a `00:00`, el servidor notifica a todos que el receso finalizó.
4. **Controles durante un countdown activo:**
   - **Pausar / Reanudar**
   - **`+5 min`** para extender el tiempo con un clic
   - **Finalizar** para cerrar la barra
   - **⛶ Pantalla grande**: abre una vista gigante de alto contraste ideal para proyector o TV del aula.

---

## 7. Controlar Pantallas Compartidas y Cola de Turnos

La interfaz separa claramente **📋 Padlets** de **🖥️ Pantallas y Cola** (también puedes elegir **🔀 Ver ambos**).

### Atender la Cola de compartidos
- Los usuarios que quieran mostrar su pantalla ingresan solo su **nombre** y **motivo** y quedan ordenados (`#1`, `#2`, `#3`...).
- Como profesor puedes:
  - **`▶ Dar turno`**: envía una alerta sonora y un botón grande directamente a ese alumno para que comience a compartir en 1 clic.
  - **`✕`**: retirar a alguien de la cola.
  - **`Limpiar`**: vaciar toda la cola.

### Cortar o Retomar una pantalla en vivo
Sobre cualquier pantalla activa tienes control inmediato:
- **`✂ Cortar` / `✂ Cortar pantalla`**: oculta la pantalla del alumno al instante para toda la clase y detiene el envío de video/audio sin cerrar su permiso.
- **`▶ Retomar` / `▶ Retomar pantalla`**: devuelve la pantalla del alumno en vivo **al instante** sin que tenga que volver a configurar nada.
- **`✕ Terminar`**: finaliza por completo la captura en el equipo del alumno.
- **`🖥️ Pedir retomar`**: en una pantalla ya detenida, envía una invitación de 1 clic al alumno para volver a compartir.

---

## 8. Revisar, Fijar, Destacar y Reordenar Padlets (Drag & Drop y Moderación)

En la pestaña **📋 Padlets**, con el Modo Profesor activo:

- **Mover respuestas arrastrándolas (Drag & Drop):** cada tarjeta incluye en la parte superior el icono de arrastre **`⠿`**. Mantén presionado y arrastra la tarjeta a la posición que desees. La línea azul indicará si se colocará antes o después de otra tarjeta. El nuevo orden se guarda y se sincroniza en tiempo real para todos los alumnos de la sesión.
- **Destacar respuestas (`⭐`):** pulsa el icono de estrella **`☆`** en cualquier tarjeta para marcarla como **`⭐ Destacada`**. Recibirá un borde dorado y resplandor especial. Además, en la barra de temas podrás hacer clic en el filtro **`⭐ Destacadas`** para ver únicamente las mejores respuestas de la clase.
- **Visto de revisada:** haz clic en **`✓ Revisar`** en cualquier tarjeta para marcarla como **`✓✓ Revisada`** (aparece un distintivo verde visible para todos). Usa los filtros **`Pendientes`** y **`✓ Revisadas`** en la barra de temas para revisar rápidamente qué aportes faltan.
- **🚫 Despublicar / Ocultar post no deseado:** si algún participante publica una respuesta indebida, spam o contenido fuera de lugar, haz clic en el botón **`🚫`** de la tarjeta. Se ocultará de inmediato para todos los alumnos (desaparece de sus pantallas en tiempo real) mientras tú la sigues viendo con un borde punteado rojo y la etiqueta **`🚫 Despublicada`**. Puedes volver a hacerla visible en cualquier momento pulsando **`👁️`** (republicar) o borrarla definitivamente con **`🗑️`**. Si tenía pantalla compartida activa, la transmisión se detiene al instante.
- **Fijar arriba (`📌`):** fija tarjetas prioritarias arriba del tablero.
- **Editar / Eliminar:** puedes corregir o retirar cualquier tarjeta si es necesario.
- **Muchas respuestas:** a partir de **6 respuestas**, el panel pasa automáticamente a **formato pequeño compacto**; haz clic sobre cualquier tarjeta pequeña para agrandarla y en `⤡` para reducirla.

---

## 9. Tests / Quiz de Opción Múltiple con Tiempo y Porcentaje de Entendimiento

Dentro de **Panel Profesor → pestaña `🧠 Tests / Quiz`**:

- **Crear previamente (borrador privado):** pulsa **＋ Crear nuevo test**, escribe preguntas con 2 a 6 opciones, marca la respuesta correcta y configura el **tiempo en segundos** individual de cada pregunta. Se guarda sin publicarse hasta que tú decidas iniciarlo.
- **Publicar y controlar pregunta por pregunta:** pulsa **▶ Publicar**; los alumnos ven cada pregunta con su reloj. Al llegar a `0s` (o al pulsar **👁 Revelar respuesta ahora**), se muestra la opción correcta y el porcentaje de comprensión de esa pregunta; luego avanzas con **➡ Siguiente pregunta**.
- **Análisis de entendimiento (`📊 Análisis`):** muestra el **porcentaje global de entendimiento**, destaca automáticamente las **preguntas por debajo del 60%** que conviene reforzar, muestra barras por opción, tabla de puntajes por participante y permite copiar el resumen con **📋 Copiar resumen**.
- **Copiar entre sesiones:** usa **📋 Copiar** para enviar el test limpio (sin respuestas anteriores) a otra sesión de clase, o **📥 Traer de otra sesión** para importarlo a la sesión activa.

---

## 10. Selector de Sesión al entrar, Sesiones de Clase y Limpiar / Reiniciar

PadletLocal permite gestionar **múltiples sesiones de clase en el mismo día** con aislamiento completo de respuestas, tareas y temporizadores:

- **Selector de sesión al entrar:** al ingresar al panel, tanto el profesor como los alumnos ven una ventana para elegir en qué sesión trabajar. Los alumnos **solo pueden ver y entrar a las sesiones habilitadas** por el profesor.
- **Cambiar de sesión en cualquier momento:** usa el botón **`📚 Cambiar sesión`** en la barra superior para cambiarte de clase o consultar otra sesión sin cerrar el navegador.
- **Crear nueva sesión:** en **Panel Profesor → `📚 Sesiones y Limpieza`**, escribe el nombre (ej. *"Clase 10:00 AM — Grupo B"*), descripción opcional y elige si deseas habilitarla de inmediato para alumnos o dejarla como borrador.
- **📢 Publicar / 👁️‍🗨️ Despublicar sesión:**
  - **Habilitada (`📢`):** visible y accesible para todos los alumnos en el selector.
  - **Despublicada (`👁️‍🗨️`):** oculta para los alumnos (modo borrador privado). Si despublicas una sesión mientras hay alumnos dentro, el sistema los desaloja de forma segura hacia el selector de sesiones habilitadas.
- **🔒 Cerrar sesión (modo solo lectura):** impide que los alumnos publiquen o compartan pantalla, pero les permite leer las respuestas, tareas e historial.
- **✏️ Renombrar / 🗑️ Eliminar sesiones:** cambia el nombre de la clase o elimínala permanentemente junto con sus imágenes adjuntas.
- **🧹 Limpiar solo respuestas:** elimina todos los Padlets y pantallas de la sesión actual conservando las tareas y el título (ideal para reutilizar la misma tarea con otro grupo).
- **🔄 Reiniciar sesión completa:** deja la sesión actual completamente en blanco (sin respuestas, tareas, avisos ni temporizadores).
- **Icono 📖 Manual en la barra superior:** cuando el Modo Profesor está activo, el icono de libro abre directamente este Manual del Profesor en HTML; para los alumnos abre el Manual de Usuarios.

---

## 11. Datos locales, Respaldos y Actualización Segura

- **Publicaciones, tareas y configuración:** se guardan en `data/posts.json` y `data/panel.cfg`.
- **Imágenes subidas:** se almacenan en `uploads/`.
- **Certificados TLS:** se guardan en `certs/` (`PadletLocal-RootCA.crt` y `server.cert`).
- **Actualizar PadletLocal sin perder información:**
  - Abre `PadletLocal.bat` y selecciona la opción **`[9] Buscar y aplicar actualizaciones (Git / Backup Seguro)`**.
  - El sistema crea un respaldo automático en `data/backups/`, descarga las mejoras desde el repositorio GitHub y ejecuta `npm install` sin tocar tus publicaciones ni sesiones.
- **¿Un alumno no puede compartir pantalla?** Asegúrate de que esté conectado por **`https://`** (no por `http://`).
- **¿El sonido no se escucha en un equipo?** El usuario debe haber hecho al menos un clic en la página y tener el icono de altavoz activado en la barra superior.

---

## 12. Información del Desarrollador y Soporte

**Sobre CoDevNexus**:
CoDevNexus (*Código + Desarrollo + Unión*) es una firma especializada en ingeniería de software y arquitectura tecnológica. Nos dedicamos a crear ecosistemas digitales robustos, integrando desarrollo Full-Stack, infraestructura de servidores, redes empresariales, sistemas de seguridad electrónica e IoT. Transformamos necesidades operativas complejas en herramientas eficientes, escalables y seguras.

- **Sitio Web Oficial:** [www.codevnexus.tech](https://www.codevnexus.tech)
- **Soporte y Contacto:** [jmejia@codevnexus.tech](mailto:jmejia@codevnexus.tech)
