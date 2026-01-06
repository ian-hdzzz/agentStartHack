# CEA Querétaro - ServiceNow API Reference

> **System:** Aquacis Integration  
> **Version:** 2025  
> **Last Updated:** January 2025

---

## Quick Reference

| Service | Type | Endpoint | Operations |
|---------|------|----------|------------|
| CEA App | REST | — | Update/Cancel Cases, Reference WO |
| CEA UpdateCasesVA | REST | appcea.ceaqueretaro.gob.mx | Same as CEA App |
| CEA Contratación | SOAP | InterfazGenericaContratacionWS | consultaDetalleContrato, getContrato, getContratos |
| CEA Órdenes | SOAP | InterfazGenericaOrdenesServicioWS | crearOrdenTrabajo, resolveOT, informarVisita |
| CEA Contadores | SOAP | InterfazGenericaContadoresWS | getPuntoServicioPorContador |
| CEA Deuda | SOAP | InterfazGenericaGestionDeudaWS | getDeuda |
| CEA Lecturas | SOAP | InterfazOficinaVirtualClientesWS | getLecturas |
| CEA Recibo | SOAP | InterfazOficinaVirtualClientesWS | getContrato, cambiarEmail, cambiarPersona, cambiarTipoFactura |

---

## REST APIs

### CEA App / CEA UpdateCasesVA

**Base URL:** `https://appcea.ceaqueretaro.gob.mx/ceadevws/`

#### PUT - Update Case to Closed

Cierra un caso en ServiceNow.

```json
{
    "evento": "terminar_reporte_caso",
    "data": {
        "sn_caso": "${case}",
        "sn_code": "${code}",
        "sn_notes": "${note}"
    }
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `sn_caso` | string | Número de caso ServiceNow |
| `sn_code` | string | Código de resolución |
| `sn_notes` | string | Notas de cierre |

---

#### PUT - Reference Work Order Aquacis

Asocia una orden de trabajo de Aquacis a un caso.

```json
{
    "evento": "asigna_orden_aquacis",
    "data": {
        "sys_id": "${case_id}",
        "orden_aquacis": "${wo_id}"
    }
}
```

| Parameter | Type | Description |
|-----------|------|-------------|
| `sys_id` | string | ID del caso en ServiceNow |
| `orden_aquacis` | string | ID de la orden en Aquacis |

---

#### PUT - Update Case to Cancelled

Anula/cancela un caso.

```json
{
    "evento": "anular_reporte_caso",
    "data": {
        "sn_caso": "${case}"
    }
}
```

---

## SOAP APIs

### CEA ConsultaDetalleContrato

**Endpoint:** `http://aquacis-cf-int.ceaqueretaro.gob.mx/Comercial/services/InterfazGenericaContratacionWS`

#### consultaDetalleContrato

Obtiene detalles de un contrato específico.

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:occ="http://occamWS.ejb.negocio.occam.agbar.com">
   <soapenv:Header/>
   <soapenv:Body>
      <occ:consultaDetalleContrato>
         <numeroContrato>${numeroContrato}</numeroContrato>
         <idioma>${idioma}</idioma>
      </occ:consultaDetalleContrato>
   </soapenv:Body>
</soapenv:Envelope>
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `numeroContrato` | string | Yes | Número de contrato (puede enviar múltiples) |
| `idioma` | string | Yes | Código de idioma (es, en) |

---

#### getContrato

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:occ="http://occamWS.ejb.negocio.occam.agbar.com">
   <soapenv:Header/>
   <soapenv:Body>
      <occ:getContrato>
         <numContrato>${numContrato}</numContrato>
         <idioma>${idioma}</idioma>
         <opciones>${opciones}</opciones>
      </occ:getContrato>
   </soapenv:Body>
</soapenv:Envelope>
```

---

#### getContratos

Búsqueda de múltiples contratos con filtros.

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:occ="http://occamWS.ejb.negocio.occam.agbar.com">
   <soapenv:Header/>
   <soapenv:Body>
      <occ:getContratos>
         <numeroContrato>${numeroContrato}</numeroContrato>
         <actividad>${actividad}</actividad>
         <actividadSectorial>${actividadSectorial}</actividadSectorial>
         <uso>${uso}</uso>
         <cnaeDesde>${cnaeDesde}</cnaeDesde>
         <cnaeHasta>${cnaeHasta}</cnaeHasta>
         <estados>
            <string>${estado}</string>
         </estados>
      </occ:getContratos>
   </soapenv:Body>
</soapenv:Envelope>
```

---

### CEA CrearOrdenDeTrabajo

**Endpoint:** `http://aquacis-cf-int.ceaqueretaro.gob.mx/Comercial/services/InterfazGenericaOrdenesServicioWS`

#### crearOrdenTrabajo

Crea una nueva orden de trabajo.

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:int="http://interfazgenericaordenesservicio.occamcxf.occam.agbar.com/">
   <soapenv:Header/>
   <soapenv:Body>
      <int:crearOrdenTrabajo>
         <idioma>es</idioma>
         <ordenTrabajo>
            <tipoOrden>${tipoOrden}</tipoOrden>
            <motivoOrden>${motivoOrden}</motivoOrden>
            <fechaCreacionOrden>${fechaCreacionOrden}</fechaCreacionOrden>
            <numContrato>${numContrato}</numContrato>
            <idPtoServicio>${idPtoServicio}</idPtoServicio>
            <fechaEstimdaFin>${fechaEstimdaFin}</fechaEstimdaFin>
            <observaciones>${observaciones}</observaciones>
            <codigoObsCambCont></codigoObsCambCont>
            <codigoReparacion>${codigoReparacion}</codigoReparacion>
            <anyoExpediente>${anyoExpediente}</anyoExpediente>
            <numeroExpediente></numeroExpediente>
            <instalaValvulaPaso>0</instalaValvulaPaso>
         </ordenTrabajo>
         <enCurso>0</enCurso>
      </int:crearOrdenTrabajo>
   </soapenv:Body>
</soapenv:Envelope>
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tipoOrden` | string | Yes | Tipo de orden de trabajo |
| `motivoOrden` | string | Yes | Motivo de la orden |
| `fechaCreacionOrden` | date | Yes | Fecha de creación (YYYY-MM-DD) |
| `numContrato` | string | Yes | Número de contrato asociado |
| `idPtoServicio` | string | Yes | ID del punto de servicio |
| `fechaEstimdaFin` | date | Yes | Fecha estimada de finalización |
| `observaciones` | string | No | Observaciones adicionales |
| `codigoReparacion` | string | No | Código de reparación |
| `anyoExpediente` | string | No | Año del expediente |

---

#### resolveOT

Resuelve/cierra una orden de trabajo con todos los detalles de la intervención.

**Estructura Principal:**

```xml
<int:resolveOT>
   <otResolution>
      <otResolutionData>...</otResolutionData>
      <otResolutionElements>...</otResolutionElements>
      <otResolutionEquipments>...</otResolutionEquipments>
      <vistitComments>...</vistitComments>
   </otResolution>
</int:resolveOT>
```

**otResolutionData (Datos de Resolución):**

| Field | Required | Description |
|-------|----------|-------------|
| `operationalSiteID` | No | ID del sitio operacional |
| `installationID` | No | ID de instalación |
| `systemOrigin` | No | Sistema de origen |
| `otClass` | Yes | Clase de OT |
| `otOrigin` | No | Origen de la OT |
| `endDateOt` | Yes | Fecha fin de OT |
| `endLastTaskOt` | Yes | Fecha fin última tarea |
| `finalSolution` | No | Solución final |
| `nonExecutionMotive` | No | Motivo de no ejecución |
| `solutionDescription` | No | Descripción de solución |
| `executorIdentifier` | No | ID del ejecutor |
| `executorName` | No | Nombre del ejecutor |
| `transmitterInstalled` | Yes | Transmisor instalado (0/1) |
| `language` | No | Idioma |
| `suspensionLevel` | No | Nivel de suspensión |

**otResolutionElements (Elementos - Medidores):**

| Field | Required | Description |
|-------|----------|-------------|
| `installedOrRetired` | Yes | Instalado o retirado |
| `meterDial` | Yes | Dial del medidor |
| `meterBrandID` | No | ID marca del medidor |
| `meterModel` | No | Modelo |
| `meterGauge` | No | Calibre |
| `serialNumber` | No | Número de serie |
| `manufacturedYear` | Yes | Año de fabricación |
| `installationDate` | Yes | Fecha de instalación |
| `dateReading` | Yes | Fecha de lectura |
| `readingRegister` | Yes | Registro de lectura |

**Geolocalization (dentro de otResolutionData):**

| Field | Description |
|-------|-------------|
| `longitude` | Longitud |
| `latitude` | Latitud |
| `coordinatesType` | Tipo de coordenadas |
| `codificationType` | Tipo de codificación |
| `captureDate` | Fecha de captura |

---

#### informarVisita

Registra información de una visita técnica.

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:int="http://interfazgenericaordenesservicio.occamcxf.occam.agbar.com/">
   <soapenv:Header/>
   <soapenv:Body>
      <int:informarVisita>
         <id>${id}</id>
         <codOrden>${codOrden}</codOrden>
         <fechaVisita>${fechaVisita}</fechaVisita>
         <resultado>${resultado}</resultado>
         <idOperario>${idOperario}</idOperario>
         <nombreOperario>${nombreOperario}</nombreOperario>
         <cifContratista>${cifContratista}</cifContratista>
         <nombreContratista>${nombreContratista}</nombreContratista>
         <codIncidencia>${codIncidencia}</codIncidencia>
         <descIncidencia>${descIncidencia}</descIncidencia>
         <observaciones>${observaciones}</observaciones>
         <aResponsable>
            <codVinculacion>${codVinculacion}</codVinculacion>
            <idDocFirma>${idDocFirma}</idDocFirma>
            <personaVisita>
               <nombre>${nombre}</nombre>
               <apellido1>${apellido1}</apellido1>
               <apellido2>${apellido2}</apellido2>
               <telefono>${telefono}</telefono>
               <nif>${nif}</nif>
            </personaVisita>
         </aResponsable>
      </int:informarVisita>
   </soapenv:Body>
</soapenv:Envelope>
```

---

### CEA GetContador

**Endpoint:** `https://aquacis-cf-int.ceaqueretaro.gob.mx/Comercial/services/InterfazGenericaContadoresWS`

#### getPuntoServicioPorContador

Obtiene información del punto de servicio a partir del número de serie del medidor.

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:int="http://interfazgenericacontadores.occamcxf.occam.agbar.com/">
   <soapenv:Header/>
   <soapenv:Body>
      <int:getPuntoServicioPorContador>
         <listaNumSerieContador>${listaNumSerieContador}</listaNumSerieContador>
         <usuario>${usuario}</usuario>
         <idioma>${idioma}</idioma>
         <opciones>${opciones}</opciones>
      </int:getPuntoServicioPorContador>
   </soapenv:Body>
</soapenv:Envelope>
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `listaNumSerieContador` | string | Yes | Número(s) de serie del medidor |
| `usuario` | string | Yes | Usuario que realiza la consulta |
| `idioma` | string | Yes | Idioma (es) |
| `opciones` | string | Yes | Opciones adicionales |

---

### CEA getDeuda

**Endpoint:** `https://aquacis-cf-int.ceaqueretaro.gob.mx/Comercial/services/InterfazGenericaGestionDeudaWS`

> ⚠️ **Requiere autenticación WS-Security**

#### getDeuda

Consulta la deuda de un contrato.

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:int="http://interfazgenericagestiondeuda.occamcxf.occam.agbar.com/">
   <soapenv:Header>
      <wsse:Security mustUnderstand="1" 
                     xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd" 
                     xmlns:wsu="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-utility-1.0.xsd">
         <wsse:UsernameToken wsu:Id="UsernameToken-${UsernameToken}">
            <wsse:Username>${Username}</wsse:Username>
            <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${Password}</wsse:Password>
         </wsse:UsernameToken>
      </wsse:Security>
   </soapenv:Header>
   <soapenv:Body>
      <int:getDeuda>
         <tipoIdentificador>${tipoIdentificador}</tipoIdentificador>
         <valor>${valor}</valor>
         <explotacion>${explotacion}</explotacion>
         <idioma>${idioma}</idioma>
      </int:getDeuda>
   </soapenv:Body>
</soapenv:Envelope>
```

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `tipoIdentificador` | string | Yes | Tipo de identificador |
| `valor` | string | Yes | Valor del identificador |
| `explotacion` | string | Yes | Código de explotación |
| `idioma` | string | Yes | Idioma (es) |

---

### CEA GetLecturas

**Endpoint:** `https://ceaqueretaro-cf-int.aquacis.com/Comercial/services/InterfazOficinaVirtualClientesWS`

#### getLecturas

Obtiene las lecturas de un contrato.

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:occ="http://occamWS.ejb.negocio.occam.agbar.com">
   <soapenv:Header/>
   <soapenv:Body>
      <occ:getLecturas>
         <explotacion>${explotacion}</explotacion>
         <contrato>${contrato}</contrato>
         <idioma>${idioma}</idioma>
      </occ:getLecturas>
   </soapenv:Body>
</soapenv:Envelope>
```

---

### CEA SolicitudRecibo

**Endpoint:** `https://aquacis-cf-int.ceaqueretaro.gob.mx/Comercial/services/InterfazOficinaVirtualClientesWS`

#### getContrato

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:occ="http://occamWS.ejb.negocio.occam.agbar.com">
   <soapenv:Header/>
   <soapenv:Body>
      <occ:getContrato>
         <numContrato>${numContrato}</numContrato>
         <idioma>${idioma}</idioma>
         <opciones>${opciones}</opciones>
      </occ:getContrato>
   </soapenv:Body>
</soapenv:Envelope>
```

---

#### cambiarEmailNotificacionPersona

Cambia el email de notificación de una persona.

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:occ="http://occamWS.ejb.negocio.occam.agbar.com">
   <soapenv:Header/>
   <soapenv:Body>
      <occ:cambiarEmailNotificacionPersona>
         <nif>${nif}</nif>
         <nombre>${nombre}</nombre>
         <apellido1>${apellido1}</apellido1>
         <apellido2>${apellido2}</apellido2>
         <contrato>${contrato}</contrato>
         <emailAntigo>${emailAntiguo}</emailAntigo>
         <emailNuevo>${emailNuevo}</emailNuevo>
         <atencionDe>ChatBot</atencionDe>
         <codigoOficina>${codigoOficina}</codigoOficina>
         <usuario>${usuario}</usuario>
      </occ:cambiarEmailNotificacionPersona>
   </soapenv:Body>
</soapenv:Envelope>
```

---

#### cambiarPersonaNotificacionContrato

Cambia la persona de notificación de un contrato.

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:occ="http://occamWS.ejb.negocio.occam.agbar.com">
   <soapenv:Header/>
   <soapenv:Body>
      <occ:cambiarPersonaNotificacionContrato>
         <contrato>${contrato}</contrato>
         <nif>${nif}</nif>
         <email1>${email1}</email1>
         <email2>${email2}</email2>
         <usuario>${usuario}</usuario>
      </occ:cambiarPersonaNotificacionContrato>
   </soapenv:Body>
</soapenv:Envelope>
```

---

#### cambiarTipoFacturaContrato

Cambia el tipo de factura de un contrato.

```xml
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" 
                  xmlns:occ="http://occamWS.ejb.negocio.occam.agbar.com">
   <soapenv:Header/>
   <soapenv:Body>
      <occ:cambiarTipoFacturaContrato>
         <contrato>${contrato}</contrato>
         <nif>${nif}</nif>
         <tipoFactura>${tipoFactura}</tipoFactura>
         <usuario>0000004874</usuario>
      </occ:cambiarTipoFacturaContrato>
   </soapenv:Body>
</soapenv:Envelope>
```

---

## Environment URLs

| Environment | Base URL |
|-------------|----------|
| **Internal** | `aquacis-cf-int.ceaqueretaro.gob.mx` |
| **External App** | `appcea.ceaqueretaro.gob.mx` |
| **Alternative** | `ceaqueretaro-cf-int.aquacis.com` |

---

## Common Parameters

| Parameter | Values | Description |
|-----------|--------|-------------|
| `idioma` | `es`, `en` | Language code |
| `explotacion` | varies | Exploitation/operation code |
| `usuario` | string | User identifier |

---

## Error Handling

All SOAP services return standard SOAP faults. Check for:
- `soap:Fault` in response body
- `faultcode` and `faultstring` elements

---

## Notes for Integration

1. **Authentication:** Most SOAP services don't require auth header, except `getDeuda` which requires WS-Security
2. **Date Format:** Use ISO format `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm:ss`
3. **Variables:** Parameters marked with `${...}` are placeholders
4. **Namespace:** Always include proper XML namespaces

---

*Document generated from SN_-_APIs.xlsx for SUPRA integration*
