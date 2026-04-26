-- =============================================================================
-- SURP 2.0 — seed/11_notification_templates.sql
--
-- Catálogo de templates del módulo notifications (~36 plantillas).
--
-- Estructura común (MJML):
--   - Header con marca SURP
--   - Body con variables Handlebars por template
--   - Footer estándar
--
-- Idempotente: ON CONFLICT (code) DO NOTHING.
--
-- Mandatorias (no desactivables por user_notification_prefs):
--   account.password_reset_request, account.password_changed, account.locked,
--   account.login_new_device, incident.critical_created, hearing.reminder.1h,
--   api.rate_limit_exceeded.
--
-- (case.deadline.alert con severity=critical es mandatorio en runtime — el
-- dispatcher hace override; el template se mantiene NO mandatorio para que
-- las alertas de severidad media/alta sean opt-out por preferencia.)
--
-- Body MJML minimalista; el equipo puede refinarlo desde
-- /admin/notifications/templates después.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Helper: macro MJML compartido (sin literal — usamos string concat por código)
-- -----------------------------------------------------------------------------
-- Cada body sigue este wrapper:
--   <mjml><mj-body><mj-section header><mj-section content><mj-section footer>
--
-- Para mantener el seed legible usamos format() o simplemente strings literales.

-- =============================================================================
-- 1. Account (7)
-- =============================================================================

INSERT INTO notification_templates (code, subject_template, body_mjml, plain_fallback_template,
  is_mandatory, editable_by_admin, sender_address, sender_display_name, category, is_system,
  available_vars, order_index)
VALUES

  ('account.welcome',
   'Bienvenido al SURP, {{user.display_name}}',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Arauco URP</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Hola {{user.display_name}},</mj-text><mj-text>Tu cuenta SURP ha sido creada por {{created_by.display_name}}. Para acceder al sistema necesitas establecer una contraseña.</mj-text><mj-button href="{{reset_password_url}}" background-color="#1a3a5c">Establecer contraseña</mj-button><mj-text font-size="12px" color="#666">El enlace expira en 48 horas.</mj-text></mj-column></mj-section></mj-body></mjml>',
   'Hola {{user.display_name}},\n\nTu cuenta SURP ha sido creada. Establece tu contraseña: {{reset_password_url}}\n\nEl enlace expira en 48 horas.',
   true, true, 'DoNotReply@surp.cl', 'SURP — Arauco URP', 'account', true,
   '["user.display_name", "user.email", "created_by.display_name", "reset_password_url"]'::jsonb, 10),

  ('account.password_reset_request',
   'Restablece tu contraseña SURP',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Arauco URP</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Hola {{user.display_name}},</mj-text><mj-text>Recibimos una solicitud para restablecer tu contraseña. Si fuiste tú, haz click abajo:</mj-text><mj-button href="{{reset_url}}" background-color="#1a3a5c">Restablecer contraseña</mj-button><mj-text font-size="12px" color="#666">El enlace expira en 1 hora. Si no fuiste tú, ignora este correo.</mj-text></mj-column></mj-section></mj-body></mjml>',
   'Hola {{user.display_name}},\n\nRestablece tu contraseña: {{reset_url}}\n\nEl enlace expira en 1 hora. Si no fuiste tú, ignora este correo.',
   true, true, 'DoNotReply@surp.cl', 'SURP — Arauco URP', 'account', true,
   '["user.display_name", "reset_url"]'::jsonb, 20),

  ('account.password_changed',
   'Tu contraseña SURP fue cambiada',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Arauco URP</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Hola {{user.display_name}},</mj-text><mj-text>Tu contraseña SURP fue cambiada el {{changed_at}} desde IP {{ip}}.</mj-text><mj-text font-weight="bold" color="#c62828">Si no fuiste tú, contacta inmediatamente a soporte@surp.cl.</mj-text></mj-column></mj-section></mj-body></mjml>',
   'Tu contraseña SURP fue cambiada el {{changed_at}} desde IP {{ip}}. Si no fuiste tú, contacta a soporte@surp.cl.',
   true, true, 'alertas@surp.cl', 'SURP Alertas', 'account', true,
   '["user.display_name", "changed_at", "ip"]'::jsonb, 30),

  ('account.email_changed',
   'Tu email SURP fue actualizado',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Arauco URP</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Hola {{user.display_name}},</mj-text><mj-text>Tu email SURP cambió de <strong>{{old_email}}</strong> a <strong>{{new_email}}</strong>.</mj-text><mj-text>Si no autorizaste este cambio, contacta a soporte@surp.cl.</mj-text></mj-column></mj-section></mj-body></mjml>',
   'Tu email SURP cambió de {{old_email}} a {{new_email}}. Si no autorizaste el cambio, contacta a soporte@surp.cl.',
   true, true, 'alertas@surp.cl', 'SURP Alertas', 'account', true,
   '["user.display_name", "old_email", "new_email"]'::jsonb, 40),

  ('account.login_new_device',
   'Nuevo inicio de sesión en SURP',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Arauco URP</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Hola {{user.display_name}},</mj-text><mj-text>Detectamos un nuevo inicio de sesión:</mj-text><mj-text>Fecha: {{login_at}}<br/>IP: {{ip}}<br/>Ubicación aprox: {{location}}<br/>Navegador: {{user_agent}}</mj-text><mj-text font-weight="bold" color="#c62828">Si no fuiste tú, cambia tu contraseña inmediatamente.</mj-text></mj-column></mj-section></mj-body></mjml>',
   'Nuevo inicio de sesión: {{login_at}} desde {{ip}} ({{location}}). Si no fuiste tú, cambia tu contraseña.',
   true, true, 'alertas@surp.cl', 'SURP Alertas', 'account', true,
   '["user.display_name", "login_at", "ip", "location", "user_agent"]'::jsonb, 50),

  ('account.locked',
   'Tu cuenta SURP fue bloqueada por intentos fallidos',
   '<mjml><mj-body><mj-section background-color="#c62828" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Cuenta bloqueada</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Hola {{user.display_name}},</mj-text><mj-text>Tu cuenta fue bloqueada tras {{attempts}} intentos fallidos de acceso desde IP {{ip}}.</mj-text><mj-text>Para desbloquear, contacta al administrador del sistema o solicita restablecer contraseña.</mj-text></mj-column></mj-section></mj-body></mjml>',
   'Tu cuenta SURP fue bloqueada tras {{attempts}} intentos fallidos. Contacta al administrador.',
   true, true, 'alertas@surp.cl', 'SURP Alertas', 'account', true,
   '["user.display_name", "attempts", "ip"]'::jsonb, 60),

  ('account.roles_changed',
   'Tus roles en SURP fueron actualizados',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Arauco URP</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Hola {{user.display_name}},</mj-text><mj-text>Tus roles en SURP fueron actualizados por {{changed_by.display_name}}:</mj-text><mj-text>Roles actuales: {{roles_summary}}</mj-text></mj-column></mj-section></mj-body></mjml>',
   'Tus roles en SURP fueron actualizados por {{changed_by.display_name}}. Roles actuales: {{roles_summary}}.',
   false, true, 'DoNotReply@surp.cl', 'SURP — Arauco URP', 'account', true,
   '["user.display_name", "changed_by.display_name", "roles_summary"]'::jsonb, 70)

ON CONFLICT (code) DO NOTHING;


-- =============================================================================
-- 2. Incidents y complaints (3)
-- =============================================================================

INSERT INTO notification_templates (code, subject_template, body_mjml, plain_fallback_template,
  is_mandatory, sender_address, sender_display_name, category, is_system, available_vars, order_index)
VALUES
  ('incident.critical_created',
   '[CRÍTICO] Nuevo incidente: {{incident.type_name}} en {{incident.zone_name}}',
   '<mjml><mj-body><mj-section background-color="#c62828" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">⚠ Incidente crítico</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Tipo: <strong>{{incident.type_name}}</strong></mj-text><mj-text>Zona: {{incident.zone_name}} · Predio: {{incident.property_name}}</mj-text><mj-text>Reportado por: {{incident.reported_by_name}} a las {{incident.occurred_at}}</mj-text><mj-button href="{{incident.url}}" background-color="#c62828">Ver incidente</mj-button></mj-column></mj-section></mj-body></mjml>',
   'INCIDENTE CRÍTICO: {{incident.type_name}} en {{incident.zone_name}} - {{incident.property_name}}. Reportado por {{incident.reported_by_name}}. Ver: {{incident.url}}',
   true, 'alertas@surp.cl', 'SURP Alertas', 'incident', true,
   '["incident.type_name", "incident.zone_name", "incident.property_name", "incident.reported_by_name", "incident.occurred_at", "incident.url"]'::jsonb, 100),

  ('incident.assigned',
   'Incidente asignado: {{incident.code}}',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Arauco URP</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Te asignaron el incidente <strong>{{incident.code}}</strong>: {{incident.type_name}}.</mj-text><mj-button href="{{incident.url}}">Ver detalle</mj-button></mj-column></mj-section></mj-body></mjml>',
   'Te asignaron el incidente {{incident.code}}: {{incident.type_name}}. Ver: {{incident.url}}',
   false, 'DoNotReply@surp.cl', 'SURP — Arauco URP', 'incident', true,
   '["incident.code", "incident.type_name", "incident.url"]'::jsonb, 110),

  ('complaint.filed',
   'Nueva denuncia presentada: {{complaint.number}}',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Arauco URP</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Se presentó una nueva denuncia ante <strong>{{complaint.institution}}</strong>.</mj-text><mj-text>Número: {{complaint.number}}<br/>Fecha: {{complaint.filed_at}}</mj-text><mj-button href="{{complaint.url}}">Ver denuncia</mj-button></mj-column></mj-section></mj-body></mjml>',
   'Nueva denuncia {{complaint.number}} ante {{complaint.institution}}. Ver: {{complaint.url}}',
   false, 'DoNotReply@surp.cl', 'SURP — Arauco URP', 'complaint', true,
   '["complaint.number", "complaint.institution", "complaint.filed_at", "complaint.url"]'::jsonb, 200)

ON CONFLICT (code) DO NOTHING;


-- =============================================================================
-- 3. Cases — assignment / stage / closure (4)
-- =============================================================================

INSERT INTO notification_templates (code, subject_template, body_mjml, plain_fallback_template,
  is_mandatory, sender_address, sender_display_name, category, is_system, available_vars, order_index)
VALUES
  ('case.assigned',
   'Te asignaron la causa {{case.internal_code}}',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Arauco URP</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Te asignaron la causa <strong>{{case.internal_code}}</strong> como {{role}}.</mj-text><mj-text>RIT: {{case.rit}} · RUC: {{case.ruc}}<br/>Tribunal: {{case.court_name}}<br/>Materia: {{case.matter_name}}</mj-text><mj-button href="{{case.url}}">Abrir causa</mj-button></mj-column></mj-section></mj-body></mjml>',
   'Te asignaron la causa {{case.internal_code}} ({{case.rit}}/{{case.ruc}}) como {{role}}. Ver: {{case.url}}',
   false, 'DoNotReply@surp.cl', 'SURP — Arauco URP', 'case', true,
   '["case.internal_code", "case.rit", "case.ruc", "case.court_name", "case.matter_name", "role", "case.url"]'::jsonb, 300),

  ('case.attorney_changed',
   'Cambio de titular en causa {{case.internal_code}}',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Arauco URP</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>El titular de la causa <strong>{{case.internal_code}}</strong> cambió.</mj-text><mj-text>Saliente: {{outgoing_attorney}}<br/>Nuevo titular: {{new_attorney}}<br/>Cambio: {{changed_at}}</mj-text></mj-column></mj-section></mj-body></mjml>',
   'Cambio de titular en {{case.internal_code}}: {{outgoing_attorney}} → {{new_attorney}} ({{changed_at}}).',
   false, 'DoNotReply@surp.cl', 'SURP — Arauco URP', 'case', true,
   '["case.internal_code", "outgoing_attorney", "new_attorney", "changed_at"]'::jsonb, 310),

  ('case.stage.advanced',
   'Causa {{case.internal_code}} avanzó a {{stage_name}}',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Arauco URP</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>La causa <strong>{{case.internal_code}}</strong> avanzó a etapa <strong>{{stage_name}}</strong>.</mj-text><mj-text>Hito que lo gatilló: {{milestone_name}} ({{milestone_at}})</mj-text></mj-column></mj-section></mj-body></mjml>',
   'Causa {{case.internal_code}} avanzó a {{stage_name}} (hito {{milestone_name}}).',
   false, 'DoNotReply@surp.cl', 'SURP — Arauco URP', 'case', true,
   '["case.internal_code", "stage_name", "milestone_name", "milestone_at"]'::jsonb, 320),

  ('case.closed',
   'Causa {{case.internal_code}} cerrada',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Arauco URP</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>La causa <strong>{{case.internal_code}}</strong> fue cerrada.</mj-text><mj-text>Forma de término: {{closure_form}}<br/>Fecha de cierre: {{closed_at}}</mj-text></mj-column></mj-section></mj-body></mjml>',
   'Causa {{case.internal_code}} cerrada con forma {{closure_form}} el {{closed_at}}.',
   false, 'DoNotReply@surp.cl', 'SURP — Arauco URP', 'case', true,
   '["case.internal_code", "closure_form", "closed_at"]'::jsonb, 330)

ON CONFLICT (code) DO NOTHING;


-- =============================================================================
-- 4. Hearings (4)
-- =============================================================================

INSERT INTO notification_templates (code, subject_template, body_mjml, plain_fallback_template,
  is_mandatory, sender_address, sender_display_name, category, is_system, available_vars, order_index)
VALUES
  ('hearing.scheduled',
   'Audiencia agendada: {{hearing.type_name}} en {{case.internal_code}}',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Arauco URP</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Audiencia agendada para causa <strong>{{case.internal_code}}</strong>:</mj-text><mj-text>Tipo: {{hearing.type_name}}<br/>Fecha: <strong>{{hearing.scheduled_at}}</strong><br/>Tribunal: {{hearing.court_name}}<br/>Modalidad: {{hearing.modality}}{{#if hearing.meeting_url}} · <a href="{{hearing.meeting_url}}">link</a>{{/if}}</mj-text></mj-column></mj-section></mj-body></mjml>',
   'Audiencia {{hearing.type_name}} en causa {{case.internal_code}} el {{hearing.scheduled_at}} ({{hearing.modality}}).',
   false, 'DoNotReply@surp.cl', 'SURP — Arauco URP', 'hearing', true,
   '["case.internal_code", "hearing.type_name", "hearing.scheduled_at", "hearing.court_name", "hearing.modality", "hearing.meeting_url"]'::jsonb, 400),

  ('hearing.reminder.24h',
   'Recordatorio: audiencia mañana ({{case.internal_code}})',
   '<mjml><mj-body><mj-section background-color="#f9a825" padding="20px"><mj-column><mj-text color="#000000" font-size="20px" font-weight="bold">⏰ Audiencia mañana</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Recordatorio: audiencia <strong>{{hearing.type_name}}</strong> en {{hearing.scheduled_at}}.</mj-text><mj-text>Causa: {{case.internal_code}}<br/>Tribunal: {{hearing.court_name}}</mj-text></mj-column></mj-section></mj-body></mjml>',
   'Recordatorio: audiencia {{hearing.type_name}} mañana ({{hearing.scheduled_at}}) en causa {{case.internal_code}}.',
   false, 'alertas@surp.cl', 'SURP Alertas', 'hearing', true,
   '["case.internal_code", "hearing.type_name", "hearing.scheduled_at", "hearing.court_name"]'::jsonb, 410),

  ('hearing.reminder.1h',
   '⚠ AUDIENCIA EN 1 HORA: {{case.internal_code}}',
   '<mjml><mj-body><mj-section background-color="#c62828" padding="20px"><mj-column><mj-text color="#ffffff" font-size="22px" font-weight="bold">⚠ Audiencia en 1 hora</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text font-size="18px"><strong>{{hearing.type_name}}</strong></mj-text><mj-text>Causa: {{case.internal_code}}<br/>Hora: <strong>{{hearing.scheduled_at}}</strong><br/>Tribunal: {{hearing.court_name}}<br/>Modalidad: {{hearing.modality}}</mj-text>{{#if hearing.meeting_url}}<mj-button href="{{hearing.meeting_url}}" background-color="#c62828">Unirse a videoconferencia</mj-button>{{/if}}</mj-column></mj-section></mj-body></mjml>',
   '⚠ AUDIENCIA EN 1 HORA: {{hearing.type_name}} causa {{case.internal_code}} a las {{hearing.scheduled_at}}.',
   true, 'alertas@surp.cl', 'SURP Alertas', 'hearing', true,
   '["case.internal_code", "hearing.type_name", "hearing.scheduled_at", "hearing.court_name", "hearing.modality", "hearing.meeting_url"]'::jsonb, 420),

  ('hearing.completed.pending_outcome',
   'Audiencia sin resultado registrado: {{case.internal_code}}',
   '<mjml><mj-body><mj-section background-color="#f9a825" padding="20px"><mj-column><mj-text color="#000000" font-size="20px" font-weight="bold">Resultado pendiente</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>La audiencia <strong>{{hearing.type_name}}</strong> de la causa <strong>{{case.internal_code}}</strong> programada para {{hearing.scheduled_at}} no tiene resultado registrado.</mj-text><mj-text>Por favor registra el outcome.</mj-text></mj-column></mj-section></mj-body></mjml>',
   'Audiencia {{hearing.type_name}} ({{case.internal_code}}) pendiente de registrar resultado.',
   false, 'alertas@surp.cl', 'SURP Alertas', 'hearing', true,
   '["case.internal_code", "hearing.type_name", "hearing.scheduled_at"]'::jsonb, 430)

ON CONFLICT (code) DO NOTHING;


-- =============================================================================
-- 5. Deadlines + tasks (4)
-- =============================================================================

INSERT INTO notification_templates (code, subject_template, body_mjml, plain_fallback_template,
  is_mandatory, sender_address, sender_display_name, category, is_system, available_vars, order_index)
VALUES
  ('case.deadline.alert',
   '[{{severity}}] Plazo {{deadline.code}} próximo a vencer ({{case.internal_code}})',
   '<mjml><mj-body><mj-section background-color="#f9a825" padding="20px"><mj-column><mj-text color="#000000" font-size="20px" font-weight="bold">⏰ Plazo próximo a vencer</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Causa: <strong>{{case.internal_code}}</strong></mj-text><mj-text>Plazo: {{deadline.description}}<br/>Vence: <strong>{{deadline.due_at}}</strong> ({{time_remaining}})<br/>Norma: {{deadline.legal_reference}}</mj-text></mj-column></mj-section></mj-body></mjml>',
   '[{{severity}}] Plazo {{deadline.code}} en causa {{case.internal_code}} vence {{deadline.due_at}} ({{time_remaining}}).',
   false, 'alertas@surp.cl', 'SURP Alertas', 'deadline', true,
   '["case.internal_code", "deadline.code", "deadline.description", "deadline.due_at", "deadline.legal_reference", "severity", "time_remaining"]'::jsonb, 500),

  ('case.deadline.overdue',
   '[VENCIDO] Plazo {{deadline.code}} en causa {{case.internal_code}}',
   '<mjml><mj-body><mj-section background-color="#c62828" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">⚠ Plazo vencido</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Causa: <strong>{{case.internal_code}}</strong></mj-text><mj-text>Plazo vencido: {{deadline.description}}<br/>Venció: {{deadline.due_at}}<br/>Norma: {{deadline.legal_reference}}</mj-text></mj-column></mj-section></mj-body></mjml>',
   '[VENCIDO] Plazo {{deadline.code}} en {{case.internal_code}} venció el {{deadline.due_at}}.',
   false, 'alertas@surp.cl', 'SURP Alertas', 'deadline', true,
   '["case.internal_code", "deadline.code", "deadline.description", "deadline.due_at", "deadline.legal_reference"]'::jsonb, 510),

  ('task.assigned',
   'Tarea asignada en causa {{case.internal_code}}',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Arauco URP</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Te asignaron una tarea:</mj-text><mj-text><strong>{{task.title}}</strong></mj-text><mj-text>Causa: {{case.internal_code}}{{#if task.due_at}} · Vence: {{task.due_at}}{{/if}}</mj-text></mj-column></mj-section></mj-body></mjml>',
   'Tarea asignada: {{task.title}} ({{case.internal_code}}). Vence: {{task.due_at}}.',
   false, 'DoNotReply@surp.cl', 'SURP — Arauco URP', 'task', true,
   '["case.internal_code", "task.title", "task.due_at"]'::jsonb, 520),

  ('task.due',
   'Tarea por vencer: {{task.title}}',
   '<mjml><mj-body><mj-section background-color="#f9a825" padding="20px"><mj-column><mj-text color="#000000" font-size="20px" font-weight="bold">Tarea por vencer</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Tarea: <strong>{{task.title}}</strong></mj-text><mj-text>Causa: {{case.internal_code}}<br/>Vence: {{task.due_at}}</mj-text></mj-column></mj-section></mj-body></mjml>',
   'Tarea por vencer: {{task.title}} ({{case.internal_code}}) vence {{task.due_at}}.',
   false, 'alertas@surp.cl', 'SURP Alertas', 'task', true,
   '["case.internal_code", "task.title", "task.due_at"]'::jsonb, 530)

ON CONFLICT (code) DO NOTHING;


-- =============================================================================
-- 6. Querella / Appeal / Resolution (3)
-- =============================================================================

INSERT INTO notification_templates (code, subject_template, body_mjml, plain_fallback_template,
  is_mandatory, sender_address, sender_display_name, category, is_system, available_vars, order_index)
VALUES
  ('querella.filed',
   'Querella presentada en causa {{case.internal_code}}',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Arauco URP</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Querella <strong>{{querella_type}}</strong> presentada en causa {{case.internal_code}}.</mj-text><mj-text>Presentada por: {{filed_by}}<br/>Fecha: {{filed_at}}</mj-text></mj-column></mj-section></mj-body></mjml>',
   'Querella {{querella_type}} presentada en {{case.internal_code}} por {{filed_by}}.',
   false, 'DoNotReply@surp.cl', 'SURP — Arauco URP', 'querella', true,
   '["case.internal_code", "querella_type", "filed_by", "filed_at"]'::jsonb, 600),

  ('appeal.filed',
   'Recurso {{appeal.type_name}} presentado ({{case.internal_code}})',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Arauco URP</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Recurso <strong>{{appeal.type_name}}</strong> presentado.</mj-text><mj-text>Causa: {{case.internal_code}}<br/>Contra resolución: {{against_resolution}}<br/>Por: {{filed_by}}</mj-text></mj-column></mj-section></mj-body></mjml>',
   'Recurso {{appeal.type_name}} en {{case.internal_code}} presentado por {{filed_by}}.',
   false, 'DoNotReply@surp.cl', 'SURP — Arauco URP', 'appeal', true,
   '["case.internal_code", "appeal.type_name", "against_resolution", "filed_by"]'::jsonb, 610),

  ('resolution.issued',
   'Resolución dictada en causa {{case.internal_code}}',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Arauco URP</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Resolución dictada en causa <strong>{{case.internal_code}}</strong>:</mj-text><mj-text>Tipo: {{resolution.type_name}}<br/>Fecha: {{resolution.issued_at}}<br/>{{#if resolution.is_appealable}}Apelable: <strong>SÍ</strong>{{else}}No apelable{{/if}}</mj-text></mj-column></mj-section></mj-body></mjml>',
   'Resolución {{resolution.type_name}} en {{case.internal_code}} ({{resolution.issued_at}}).',
   false, 'DoNotReply@surp.cl', 'SURP — Arauco URP', 'resolution', true,
   '["case.internal_code", "resolution.type_name", "resolution.issued_at", "resolution.is_appealable"]'::jsonb, 620)

ON CONFLICT (code) DO NOTHING;


-- =============================================================================
-- 7. Reports / Exports / API / Digest / PJUD (10)
-- =============================================================================

INSERT INTO notification_templates (code, subject_template, body_mjml, plain_fallback_template,
  is_mandatory, sender_address, sender_display_name, category, is_system, available_vars, order_index)
VALUES
  ('report.ready',
   'Tu reporte está listo',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Reportes</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>El reporte <strong>{{report.name}}</strong> está listo.</mj-text><mj-button href="{{report.download_url}}">Descargar</mj-button><mj-text font-size="12px" color="#666">El enlace expira el {{report.url_expires_at}}.</mj-text></mj-column></mj-section></mj-body></mjml>',
   'Reporte {{report.name}} listo. Descargar: {{report.download_url}} (expira {{report.url_expires_at}}).',
   false, 'reportes@surp.cl', 'SURP Reportes', 'report', true,
   '["report.name", "report.download_url", "report.url_expires_at"]'::jsonb, 700),

  ('report.failed',
   'Tu reporte falló',
   '<mjml><mj-body><mj-section background-color="#c62828" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">Reporte falló</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>El reporte <strong>{{report.name}}</strong> falló: {{error_message}}</mj-text></mj-column></mj-section></mj-body></mjml>',
   'Reporte {{report.name}} falló: {{error_message}}.',
   false, 'reportes@surp.cl', 'SURP Reportes', 'report', true,
   '["report.name", "error_message"]'::jsonb, 710),

  ('export.ready',
   'Tu export está listo',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Reportes</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Tu export <strong>{{export.name}}</strong> ({{export.format}}) está listo.</mj-text><mj-button href="{{export.download_url}}">Descargar</mj-button></mj-column></mj-section></mj-body></mjml>',
   'Export {{export.name}} ({{export.format}}) listo. Descargar: {{export.download_url}}.',
   false, 'reportes@surp.cl', 'SURP Reportes', 'export', true,
   '["export.name", "export.format", "export.download_url"]'::jsonb, 720),

  ('api.key_issued',
   'Nueva API key emitida para {{consumer.name}}',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — API</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Se emitió una nueva API key para <strong>{{consumer.name}}</strong>.</mj-text><mj-text>Key ID: {{key.id}}<br/>Emitida: {{issued_at}}<br/>Expira: {{expires_at}}</mj-text><mj-text font-weight="bold" color="#c62828">El secreto se entrega solo una vez al admin del consumidor por canal seguro.</mj-text></mj-column></mj-section></mj-body></mjml>',
   'API key {{key.id}} emitida para {{consumer.name}} ({{issued_at}} - {{expires_at}}).',
   false, 'DoNotReply@surp.cl', 'SURP — Arauco URP', 'api', true,
   '["consumer.name", "key.id", "issued_at", "expires_at"]'::jsonb, 800),

  ('api.key_revoked',
   'API key revocada ({{consumer.name}})',
   '<mjml><mj-body><mj-section background-color="#c62828" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">API key revocada</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>La API key <strong>{{key.id}}</strong> de {{consumer.name}} fue revocada.</mj-text><mj-text>Razón: {{reason}}</mj-text></mj-column></mj-section></mj-body></mjml>',
   'API key {{key.id}} de {{consumer.name}} revocada. Razón: {{reason}}.',
   false, 'alertas@surp.cl', 'SURP Alertas', 'api', true,
   '["consumer.name", "key.id", "reason"]'::jsonb, 810),

  ('api.rate_limit_exceeded',
   '[CRÍTICO] Rate limit superado: {{consumer.name}}',
   '<mjml><mj-body><mj-section background-color="#c62828" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">⚠ Rate limit superado</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>El consumidor <strong>{{consumer.name}}</strong> superó el 95% de su cuota diaria.</mj-text><mj-text>Consultas: {{used}} / {{limit}}<br/>Periodo: {{period}}</mj-text></mj-column></mj-section></mj-body></mjml>',
   'Rate limit superado: {{consumer.name}} usó {{used}}/{{limit}} en {{period}}.',
   true, 'alertas@surp.cl', 'SURP Alertas', 'api', true,
   '["consumer.name", "used", "limit", "period"]'::jsonb, 820),

  ('digest.daily_incidents_by_zone',
   'Incidentes del día — {{zone.name}}',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Digest diario</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Resumen de incidentes en zona <strong>{{zone.name}}</strong> ({{date}}):</mj-text><mj-text>Total: {{summary.total}}<br/>Críticos: {{summary.critical}}<br/>Vinculados a denuncia: {{summary.with_complaint}}</mj-text><mj-button href="{{summary.url}}">Ver detalle</mj-button></mj-column></mj-section></mj-body></mjml>',
   'Digest diario zona {{zone.name}} ({{date}}): {{summary.total}} incidentes, {{summary.critical}} críticos.',
   false, 'reportes@surp.cl', 'SURP Reportes', 'digest', true,
   '["zone.name", "date", "summary.total", "summary.critical", "summary.with_complaint", "summary.url"]'::jsonb, 900),

  ('digest.weekly_cases_status',
   'Estado semanal de causas — {{week_label}}',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Digest semanal</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Resumen de causas para la semana del {{week_label}}:</mj-text><mj-text>Activas: {{summary.active}}<br/>Cerradas: {{summary.closed}}<br/>Plazos vencidos: <strong>{{summary.overdue}}</strong></mj-text></mj-column></mj-section></mj-body></mjml>',
   'Digest semanal causas: {{summary.active}} activas, {{summary.closed}} cerradas, {{summary.overdue}} plazos vencidos.',
   false, 'reportes@surp.cl', 'SURP Reportes', 'digest', true,
   '["week_label", "summary.active", "summary.closed", "summary.overdue"]'::jsonb, 910),

  ('digest.monthly_statistics',
   'Estadísticas mensuales SURP — {{month_label}}',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — Estadísticas mensuales</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>Estadísticas para {{month_label}}.</mj-text><mj-button href="{{report_url}}">Ver dashboard completo</mj-button></mj-column></mj-section></mj-body></mjml>',
   'Estadísticas mensuales {{month_label}}: {{report_url}}.',
   false, 'reportes@surp.cl', 'SURP Reportes', 'digest', true,
   '["month_label", "report_url"]'::jsonb, 920),

  ('pjud.update.detected',
   'Movimiento PJUD detectado en {{case.internal_code}}',
   '<mjml><mj-body><mj-section background-color="#1a3a5c" padding="20px"><mj-column><mj-text color="#ffffff" font-size="20px" font-weight="bold">SURP — PJUD</mj-text></mj-column></mj-section><mj-section background-color="#ffffff" padding="20px"><mj-column><mj-text>El scraper detectó un nuevo movimiento en PJUD para causa <strong>{{case.internal_code}}</strong>.</mj-text><mj-text>Resumen: {{movement_summary}}<br/>Detectado: {{detected_at}}</mj-text></mj-column></mj-section></mj-body></mjml>',
   'Movimiento PJUD en {{case.internal_code}}: {{movement_summary}} ({{detected_at}}).',
   false, 'DoNotReply@surp.cl', 'SURP — Arauco URP', 'pjud', true,
   '["case.internal_code", "movement_summary", "detected_at"]'::jsonb, 1000)

ON CONFLICT (code) DO NOTHING;


-- =============================================================================
-- 8. Verificación
-- =============================================================================

DO $$
DECLARE
  v_total INT;
  v_mandatory INT;
  v_by_category INT;
BEGIN
  SELECT count(*) INTO v_total FROM notification_templates WHERE is_system = true;
  SELECT count(*) INTO v_mandatory FROM notification_templates WHERE is_system = true AND is_mandatory = true;
  SELECT count(DISTINCT category) INTO v_by_category FROM notification_templates WHERE is_system = true;

  IF v_total < 30 THEN
    RAISE EXCEPTION 'seed/11: notification_templates incompleto (%)', v_total;
  END IF;

  RAISE NOTICE 'seed/11 OK — % templates (% mandatorias, % categorías)',
    v_total, v_mandatory, v_by_category;
END;
$$;
