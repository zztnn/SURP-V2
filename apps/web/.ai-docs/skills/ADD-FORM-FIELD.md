# Add Form Field — SURP 2.0

> Checklist de qué incluir en cada campo de formulario nuevo.

---

## Obligatorio en TODO campo

- [ ] `data-field={fieldName}` en el wrapper del campo (para scroll-to-error)
- [ ] `<Label htmlFor={id}>` con el texto del label en español
- [ ] `<FormMessage>` para mostrar errores inline debajo del campo
- [ ] `<RequiredBadge />` si el campo es requerido (no asterisco rojo)

---

## Inputs de texto

```tsx
<FormField
  control={form.control}
  name="description"
  render={({ field }) => (
    <FormItem data-field="description">
      <FormLabel>
        Descripción del incidente <RequiredBadge />
      </FormLabel>
      <FormControl>
        <Textarea
          {...field}
          placeholder="Describa lo ocurrido..."
          maxLength={2000}
          onChange={(e) => {
            React.startTransition(() => field.onChange(e.target.value));
          }}
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

---

## Campos de fecha

Siempre `<DateInput>` — nunca `<Input type="date">`:

```tsx
<FormField
  control={form.control}
  name="occurredAt"
  render={({ field }) => (
    <FormItem data-field="occurredAt">
      <FormLabel>
        Fecha del incidente <RequiredBadge />
      </FormLabel>
      <FormControl>
        <DateInput
          value={field.value}
          onChange={field.onChange}
          placeholder="dd-MM-yyyy"
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

---

## Campos de RUT (personas)

```tsx
<FormField
  control={form.control}
  name="rut"
  render={({ field }) => (
    <FormItem data-field="rut">
      <FormLabel>
        RUT <RequiredBadge />
      </FormLabel>
      <FormControl>
        <RutInput
          value={field.value}
          onChange={field.onChange}
        />
      </FormControl>
      <FormDescription>Ejemplo: 76.543.210-K</FormDescription>
      <FormMessage />
    </FormItem>
  )}
/>
```

Schema Zod con validación módulo 11:
```typescript
rut: z.string().refine(isValidRut, { message: 'El RUT ingresado no es válido.' })
```

---

## Campos de coordenadas

```tsx
<FormItem data-field="location">
  <FormLabel>Ubicación del incidente <RequiredBadge /></FormLabel>
  <CoordinateInput
    form={form}
    latName="lat"
    lngName="lng"
  />
  <FormMessage />
</FormItem>
```

---

## Dropdowns / ComboboxInput

Para FKs a catálogos (zona, área, predio, tipo de incidente, institución):

```tsx
<FormField
  control={form.control}
  name="incidentTypeId"
  render={({ field }) => (
    <FormItem data-field="incidentTypeId">
      <FormLabel>Tipo de incidente <RequiredBadge /></FormLabel>
      <FormControl>
        <ComboboxInput
          value={field.value}
          onValueChange={field.onChange}
          options={incidentTypes.map(t => ({ label: t.name, value: t.externalId }))}
          placeholder="Seleccionar tipo..."
        />
      </FormControl>
      <FormMessage />
    </FormItem>
  )}
/>
```

---

## Campos de texto largo (notas)

```tsx
<NotesField
  control={form.control}
  name="notes"
  label="Observaciones"
/>
```

---

## Accesibilidad

- [ ] Todos los inputs tienen `id` único y `Label` con `htmlFor` correspondiente
- [ ] Inputs inválidos con `aria-invalid="true"`
- [ ] Auto-focus en el primer campo del formulario al abrirse
- [ ] Tab navigation funciona en orden lógico
