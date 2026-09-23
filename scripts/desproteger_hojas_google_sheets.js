/**
 * Script de Google Apps Script para eliminar todas las protecciones de hojas y rangos.
 * 
 * INSTRUCCIONES:
 * 1. Abre tu planilla de Google Sheets ("Zono - BDLocalidades").
 * 2. En el menú superior ve a: Extensiones > Apps Script.
 * 3. Borra el código que haya y pega este contenido.
 * 4. Arriba en la barra de herramientas, asegúrate de que esté seleccionada la función "desprotegerTodo" y presiona "Ejecutar".
 * 5. Si Google te pide autorizar los permisos de tu cuenta, acéptalos.
 * 6. ¡Listo! Todas las protecciones y candados se eliminarán inmediatamente.
 */

function desprotegerTodo() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // 1. Eliminar protecciones de hojas completas (las que muestran el candado 🔒 en la pestaña)
  const sheets = ss.getSheets();
  let countSheets = 0;
  
  sheets.forEach(sheet => {
    const sheetProtections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    sheetProtections.forEach(protection => {
      if (protection.canEdit()) {
        protection.remove();
        countSheets++;
      }
    });
  });

  // 2. Eliminar protecciones de rangos específicos de celdas
  const rangeProtections = ss.getProtections(SpreadsheetApp.ProtectionType.RANGE);
  let countRanges = 0;
  
  rangeProtections.forEach(protection => {
    if (protection.canEdit()) {
      protection.remove();
      countRanges++;
    }
  });

  const msg = `Se eliminaron ${countSheets} protecciones de hojas y ${countRanges} de rangos en la planilla "${ss.getName()}".`;
  Logger.log(msg);
  SpreadsheetApp.getUi().alert("✅ " + msg);
}

/**
 * OPCIÓN ALTERNATIVA:
 * Si deseas mantener las hojas protegidas pero solo autorizar a la cuenta del sistema
 * para que pueda insertar filas automáticamente sin quitarle la protección a otros usuarios.
 */
function autorizarCuentaDeServicio() {
  const serviceAccount = "zono-sheets-sync@cargapedidoszono.iam.gserviceaccount.com";
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let count = 0;

  // En protecciones de hoja
  ss.getSheets().forEach(sheet => {
    const protections = sheet.getProtections(SpreadsheetApp.ProtectionType.SHEET);
    protections.forEach(p => {
      if (p.canEdit()) {
        p.addEditor(serviceAccount);
        count++;
      }
    });
  });

  // En protecciones de rangos
  ss.getProtections(SpreadsheetApp.ProtectionType.RANGE).forEach(p => {
    if (p.canEdit()) {
      p.addEditor(serviceAccount);
      count++;
    }
  });

  const msg = `Se autorizó a la cuenta ${serviceAccount} en ${count} protecciones.`;
  Logger.log(msg);
  SpreadsheetApp.getUi().alert("✅ " + msg);
}
