from pathlib import Path
from math import atan2, cos, sin, pi
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4, landscape
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from PIL import Image
from pypdf import PdfReader

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'output/pdf'; OUT.mkdir(parents=True,exist_ok=True)
SCREENS=ROOT/'output/logistics-planning/procedure-screens'
W,H=landscape(A4); M=38; CW=W-2*M
NAVY='#14243e'; BLUE='#1558ee'; GRAY='#52647c'; LIGHT='#edf3fc'; GREEN='#087c64'; ORANGE='#af5410'
for name,file in [('ERP','arial.ttf'),('ERP-Bold','arialbd.ttf')]:
    pdfmetrics.registerFont(TTFont(name,str(Path('C:/Windows/Fonts')/file)))
pdfmetrics.registerFontFamily('ERP',normal='ERP',bold='ERP-Bold')

class Guide:
    def __init__(self,name,role):
        self.path=OUT/name; self.role=role; self.c=canvas.Canvas(str(self.path),pagesize=(W,H));self.n=0
        self.c.setTitle('Zono ERP - '+role);self.c.setAuthor('Zono Construcción')
    def text(self,text,x,top,w=CW,size=11,color=NAVY,bold=False,leading=None):
        style=ParagraphStyle('erp',fontName='ERP-Bold' if bold else 'ERP',fontSize=size,leading=leading or size*1.4,textColor=colors.HexColor(color))
        p=Paragraph(text,style);_,h=p.wrap(w,H);p.drawOn(self.c,x,H-top-h);return h
    def page(self,title,sub=''):
        if self.n:self.c.showPage()
        self.n+=1;self.c.setFillColor(colors.HexColor(BLUE));self.c.rect(0,H-9,W,9,fill=1,stroke=0)
        self.text('ZONO CONSTRUCCIÓN  /  ERP',M,25,size=9,bold=True,color=BLUE)
        self.text(self.role,W-300,25,w=262,size=9,color=GRAY)
        self.text(title,M,54,size=23,bold=True)
        if sub:self.text(sub,M,91,size=10,color=GRAY)
        self.c.setStrokeColor(colors.HexColor('#dce4ef'));self.c.line(M,34,W-M,34)
        self.text('Guía operativa  |  17/10/2026  |  Edición 3  |  Pantallas locales con datos de demostración',M,H-25,size=8,color=GRAY)
        self.text(str(self.n),W-68,H-25,w=30,size=8,color=GRAY)
    def note(self,text,top,color=BLUE):
        h=self.text(text,M+13,top+10,w=CW-26,size=10,color=color)+20
        self.c.saveState();self.c.setFillColor(colors.HexColor(LIGHT));self.c.setStrokeColor(colors.HexColor('#c6d6f0'))
        self.c.roundRect(M,H-top-h,CW,h,8,fill=1,stroke=1);self.c.restoreState()
        self.text(text,M+13,top+10,w=CW-26,size=10,color=color)
        return h
    def screen(self,title,sub,file,pins,notes,tail=''):
        self.page(title,sub)
        path=SCREENS/file;iw,ih=Image.open(path).size
        scale=min(CW/iw,270/ih);w=iw*scale;h=ih*scale;x=(W-w)/2;top=123
        self.c.drawImage(str(path),x,H-top-h,w,h)
        self.c.setStrokeColor(colors.HexColor('#dce4ef'));self.c.rect(x,H-top-h,w,h,fill=0,stroke=1)
        for n,px,py in pins:
            xx=x+px*w;yy=H-top-py*h
            self.c.setFillColor(colors.HexColor(BLUE));self.c.setStrokeColor(colors.white);self.c.circle(xx,yy,9,fill=1,stroke=1)
            self.c.setFont('ERP-Bold',10);self.c.setFillColor(colors.white);self.c.drawCentredString(xx,yy-3,str(n))
        start=top+h+16;rows=(len(notes)+1)//2
        for k,(head,body) in enumerate(notes):
            col=k%2;row=k//2
            self.text(f'<b>{k+1}. {head}</b><br/>{body}',M+col*(CW/2+7),start+row*61,w=CW/2-18,size=10)
        if tail:self.text(tail,M,start+rows*61+3,size=9,color=GRAY)
    def box(self,x,top,w,h,title,body='',color=BLUE):
        self.c.setFillColor(colors.HexColor(LIGHT));self.c.setStrokeColor(colors.HexColor(color));self.c.roundRect(x,H-top-h,w,h,8,fill=1,stroke=1)
        self.text(title,x+10,top+9,w-20,size=11,bold=True,color=color)
        if body:self.text(body,x+10,top+29,w-20,size=9)
    def arrow(self,points,color=GRAY):
        self.c.setStrokeColor(colors.HexColor(color));self.c.setLineWidth(1.4)
        for a,b in zip(points,points[1:]):self.c.line(a[0],H-a[1],b[0],H-b[1])
        a,b=points[-2:];angle=atan2(b[1]-a[1],b[0]-a[0]);p=self.c.beginPath();p.moveTo(b[0],H-b[1])
        for d in [-.45,.45]:p.lineTo(b[0]-7*cos(angle+d),H-(b[1]-7*sin(angle+d)))
        p.close();self.c.setFillColor(colors.HexColor(color));self.c.drawPath(p,fill=1,stroke=0)
    def flow(self,kind):
        logistics=kind=='logistics'
        self.page('Flujo de Logística' if logistics else 'Flujo de Administración / Tesorería','Seguí las flechas. Cada servicio mantiene su LOG durante todo el circuito.')
        nodes=([
            ('1. Preparar salida','Fecha, fletero, vehículo, acompañante y cargas.'),('2. Revisar tarifa / acuerdo','Comprobar vigencia y qué conceptos incluye.'),('3. Ejecutar y registrar','Salida inicial, regreso final y km reales totales.'),
            ('4. Agregar extras','Concepto e importe en su LOG; referencia opcional.'),('5. Cerrar y guardar','Cerrada si se realizó; No salió si se canceló.'),('6. Entregar a Administración','La salida cerrada aparece en Liquidaciones de fletes.')
        ] if logistics else [
            ('1. Abrir pendientes','Liquidaciones de fletes, sin límite de fecha.'),('2. Comprobar pagos previos','Si existe PAG, vincularlo; evitar registrar otro.'),('3. Revisar costo y novedades','Responsable, LOG de origen y compensaciones disponibles.'),
            ('4. Confirmar valor y saldo','Separar costo del servicio y neto a abonar.'),('5. Registrar o distribuir pago','Fecha efectiva, cuenta y aplicación a cada LOG.'),('6. Comprobar resultado','Sin saldo sale de pendientes. Diferencia hasta $500: aceptar.')
        ])
        xs=[M, M+274, M+548];positions=[(xs[0],147),(xs[1],147),(xs[2],147),(xs[2],283),(xs[1],283),(xs[0],283)]
        for (x,y),(title,body) in zip(positions,nodes):self.box(x,y,218,86,title,body)
        for a,b in [(0,1),(1,2)]:self.arrow([(positions[a][0]+218,190),(positions[b][0],190)])
        self.arrow([(xs[2]+109,233),(xs[2]+109,283)])
        self.arrow([(xs[2],326),(xs[1]+218,326)]);self.arrow([(xs[1],326),(xs[0]+218,326)])
        self.note(('<b>Extra descubierto después:</b> abrir el LOG original, guardar el concepto. Queda como Extras por confirmar; se conserva lo abonado. No cargarlo en el costo de otro recorrido.' if logistics else '<b>Saldo o extra posterior:</b> vuelve a la revisión del LOG original. Confirmar el adicional y pagar sólo lo pendiente; se puede agrupar con otro servicio del mismo responsable.'),413)
        self.text('Si falta acordar el importe, revisar el costo antes de pagar. Una salida cancelada no integra la bandeja de pagos.',M,501,size=10,color=GRAY)
    def total(self):
        self.page('Circuito completo: de la salida al pago','El LOG conecta el servicio; el PAG identifica el dinero entregado y su distribución.')
        xs=[M,M+274,M+548]
        for x,label in zip(xs,['LOGÍSTICA','ERP / REGISTRO','ADMINISTRACIÓN / TESORERÍA']):self.text(label,x,125,w=218,size=10,bold=True,color=BLUE)
        self.box(xs[0],153,218,67,'Preparar salida','Fletero, vehículo, cargas y fecha.')
        self.box(xs[1],153,218,67,'LOG único','Tarifa guardada y pedidos vinculados.')
        self.box(xs[0],249,218,75,'Registrar lo realizado','Km reales, acompañante, extras y cierre.')
        self.box(xs[1],249,218,75,'Servicio cerrado','Aparece en Liquidaciones de fletes.')
        self.box(xs[2],249,218,75,'Revisar y confirmar','Costo, pagos previos, faltantes y cuotas.')
        self.box(xs[2],353,218,75,'Registrar / vincular PAG','Pago real, parcial o conjunto; reparto por LOG.')
        self.box(xs[1],353,218,75,'Actualizar saldo','Liquidada o pendiente. Conservar lo ya abonado.')
        self.box(xs[0],458,218,62,'Extra posterior','Guardar en su LOG de origen.',ORANGE)
        self.box(xs[1],458,218,62,'Volver a revisión','Extras por confirmar, aunque sea antiguo.',ORANGE)
        self.box(xs[2],458,218,62,'Confirmar y pagar el saldo','Conservar el pago anterior.',ORANGE)
        for top in [186,286,489]:
            self.arrow([(xs[0]+218,top),(xs[1],top)],ORANGE if top==489 else GRAY)
        self.arrow([(xs[0]+109,220),(xs[0]+109,249)])
        self.arrow([(xs[1]+218,286),(xs[2],286)])
        self.arrow([(xs[2]+109,324),(xs[2]+109,353)])
        self.arrow([(xs[2],391),(xs[1]+218,391)])
        self.arrow([(xs[1]+218,489),(xs[2],489)],ORANGE)
    def save(self):
        self.c.save();reader=PdfReader(self.path)
        for page in reader.pages:assert (page.extract_text() or '').strip()
        return {'file':str(self.path),'pages':len(reader.pages)}

g=Guide('instructivo-logistica-fletes.pdf','LOGÍSTICA');g.flow('logistics')
g.screen('1. Preparar la salida','Salidas > Nueva salida o Ver / editar > Planificación. Captura de demostración.','01-planificacion.png',[(1,.60,.06),(2,.60,.18),(3,.39,.46),(4,.14,.64)],[
 ('Identificar el servicio','Confirmá fecha, fletero y vehículo. El LOG se genera al guardar una salida nueva.'),('Confirmar quién viaja','Revisá acompañante y responsable del ruteo; no des por correcto un valor habitual.'),('Completar cada carga','Hora prevista, Duración de Ruta calculada, enlace y km previstos. Pedidos y zona vienen de los pedidos vinculados.'),('Separar R1 / R2','Usá Agregar otra carga si vuelve a cargar. La base se liquida una vez para el mismo LOG, salvo acuerdo distinto.')])
g.screen('2. Registrar lo que ocurrió','Ver / editar > Lo realizado. El cálculo tarifario utiliza los kilómetros reales.','02-realizado.png',[(1,.28,.22),(2,.93,.40),(3,.44,.85)],[
 ('Horarios del LOG','Cargá la salida de la mañana y el regreso final. Podés escribir 7:30 o usar el selector de hora y minutos. Horarios por recorrido es opcional.'),('Km reales totales','Cargar kms Route copia los km previstos de todas las cargas. Corregí el total si lo realizado fue distinto: la tarifa se calcula con km reales.'),('Cerrar después de revisar','Seleccioná Cerrada y guardá cuando la información esté completa. Cerrar no significa que el fletero ya cobró.')], 'Si una hora de regreso cruza la medianoche, revisá que la duración resultante corresponda al servicio.')
g.screen('3. Registrar extras en el LOG correcto','Lo realizado > + Agregar extra del servicio. Captura de demostración.','02b-extras.png',[(1,.14,.47),(2,.61,.47),(3,.87,.47)],[
 ('Elegir y describir','Indicá retiro, diligencia, encomienda, espera, ajuste de km u otro concepto y su motivo.'),('Cargar el importe','Registrá sólo el adicional que falta reconocer. No repitas importes ya incluidos en el servicio, la tarifa o un extra anterior.'),('Referencia opcional, sin inventar códigos','Escribí, por ejemplo: Retiro en Fibrosur, acordado con Matías. Si existe un comprobante, indicá su número real.')], 'REND-DEMO y RET-DEMO eran ejemplos ficticios, no códigos del ERP. Podés dejarlos vacíos o escribir una descripción clara. Extra de otro día: abrí el LOG original y usá Guardar extras del LOG original. Laura lo verá en pendientes de todas las fechas como Extras por confirmar, conservando el pago anterior.')
g.screen('Kilómetros extra: importe sugerido','El ajuste corresponde al servicio original, aunque se liquide junto con otro día.','02c-km-extra.png',[(1,.15,.46),(2,.60,.46),(3,.36,.58)],[
 ('Indicar el motivo','Usá Ajuste de km para kilómetros omitidos. No vuelvas a cargar aquí los excedentes que ya calcula la tarifa del servicio.'),('Revisar la sugerencia','Ingresá los kilómetros adicionales. El valor por km se propone desde la tarifa guardada en este LOG, conservando la condición histórica.'),('Acordar una excepción','Podés editar el valor por km o volver con Usar tarifa del LOG. Si no existe una tarifa válida, acordá y cargá el importe antes de cerrar.')], 'Ejemplo de demostración: 10 km adicionales a $1.100 por km = $11.000. El importe no corresponde necesariamente a la tarifa vigente de hoy.')

g.screen('4. Revisar el acuerdo y entregar el servicio','Tarifa prevista. La captura muestra un viaje con base acordada, sin tarifa automática seleccionada.','03-acuerdo.png',[(1,.40,.28),(2,.43,.48),(3,.45,.85)],[
 ('Revisar la tarifa','Comprobá el fletero y la fecha. Si falta una condición, pedí al administrador que complete la tarifa vigente.'),('Documentar lo negociado','Un importe base acordado reemplaza la base calculada. Los extras se cargan aparte una sola vez.'),('Cerrar y guardar','Volvé a revisar Lo realizado y guardá Cerrada. El servicio aparece en Liquidaciones de fletes para Administración.')], 'Acompañante y peajes: revisá el alcance del acuerdo y la tarifa. No tomes los valores de estas pantallas de ejemplo como precios vigentes.')
g.page('5. Control al terminar','Lista de trabajo para Logística. No hace falta volver a cargar el resumen en una planilla.')
items=[('Antes de salir','Fecha y fletero correctos; vehículo y acompañante reales; cada carga con su ruta y datos previstos.'),('Al regresar','Salida inicial y regreso final; km reales totales; incidencias y extras en su LOG de origen. La referencia es opcional.'),('Al cerrar','La salida quedó Cerrada y se puede identificar por su LOG en Liquidaciones de fletes. Si falta acordar el costo, señalarlo en observaciones.'),('Si no salió','Seleccionar No salió y explicar el motivo. Esa salida no debe quedar como un pago pendiente.'),('Si aparece un concepto antiguo','Registrarlo en el LOG donde ocurrió. No sumarlo como costo del recorrido de hoy.'),('Si Laura detecta una diferencia','Revisar km, acompañante, acuerdo y comprobantes del LOG. Aclarar el motivo antes de modificar o repetir conceptos.')]
for i,(head,body) in enumerate(items):
    x=M+(i%2)*(CW/2+10);y=135+(i//2)*112;g.box(x,y,CW/2-12,92,head,body)
log_result=g.save()

g=Guide('instructivo-administracion-tesoreria-fletes.pdf','ADMINISTRACIÓN / TESORERÍA');g.flow('admin')
g.screen('1. Trabajar desde los pendientes','Liquidaciones de fletes > Pendientes de revisar / pagar. No depende de la fecha del servicio.','04-bandeja.png',[(1,.13,.19),(2,.80,.43),(3,.80,.63),(4,.96,.43)],[
 ('Abrir pendientes','La bandeja reúne servicios sin pagar, saldos parciales, pagos por vincular y extras por confirmar.'),('Leer costo, abonado y saldo','Ejemplo: costo $300.000, compensación $20.000 y abonado $100.000; quedan $180.000.'),('Revisar extras antiguos','El LOG de septiembre ya tiene $300.000 abonados. El extra se confirma antes de pagar otro importe.'),('Abrir el detalle','Usá Revisar / vincular pago. Un pago en Caja por vincular se resuelve antes de generar otro egreso.')])
g.screen('2. Confirmar el costo y las compensaciones','Revisar / vincular pago > Valor del servicio y descuentos. Captura de demostración.','05-saldo.png',[(1,.50,.16),(2,.45,.49),(3,.49,.76),(4,.18,.94)],[
 ('Valor del servicio','Incluí el servicio y los extras de este LOG. Un concepto de otro día conserva su LOG de origen.'),('Separar la compensación','Faltante, cuota o adelanto: Recupero de faltante / cuota / adelanto. Sólo una reducción del precio es Rebaja comercial acordada del servicio.'),('Revisar rendición y novedades','Abrí el detalle de la rendición vinculada. Si hay un faltante confirmado, usá Revisar / registrar faltante; evitá volver a cargar una novedad existente.'),('Confirmar valor y saldo','Revisá neto, abonado y saldo antes de confirmar. No se cambia el importe de los pagos ya registrados.')])
g.screen('Rendiciones vinculadas y faltantes','Revisar / vincular pago > Rendiciones de este LOG.','05b-rendicion.png',[(1,.16,.41),(2,.17,.62),(3,.48,.62)],[
 ('Abrir la rendición','El enlace permite consultar el detalle del efectivo esperado y contado del LOG.'),('Revisar el motivo','Una diferencia de rendición no demuestra por sí sola una deuda del fletero. Verificá qué ocurrió y quién responde.'),('Registrar una sola novedad','Revisar / registrar faltante precarga responsable, LOG, fecha, importe y referencia. Revisá los datos; guardá y aplicá el recupero al confirmar el saldo.')], 'Si la novedad ya existe, aplicá la disponible; no la cargues nuevamente. La fecha del hecho y la fecha del descuento pueden ser diferentes.')

g.screen('3. Registrar faltantes, cuotas y recuperos','Novedades > Nueva novedad. Guardarla no crea un movimiento de dinero.','08-novedad.png',[(1,.15,.25),(2,.67,.19),(3,.76,.44),(4,.58,.81)],[
 ('Primero, responsable','Seleccioná fletero o empresa según quién debe responder. GyV y GV son la misma empresa. El LOG se filtra con esta selección.'),('Después, LOG de origen','Buscá por código y seleccioná el servicio donde ocurrió el hecho. Para una cuota o adelanto general, elegí Sin LOG específico de forma explícita.'),('Fecha, tipo e importe','La fecha corresponde al hecho, aunque se descuente después. Indicá faltante, cuota o adelanto y el importe confirmado.'),('Referencia opcional, sin inventar códigos','Escribí Rendición del 16/10/2026 o Termotanque, cuota 2 de 4. Si hay un código real del ERP, podés indicarlo.')], 'REND-DEMO y RET-DEMO eran ejemplos ficticios, no códigos que debas crear. La referencia es texto libre opcional; podés dejarla vacía. No dupliques una novedad para volver a descontarla. La tabla distingue el LOG de origen del LOG donde se aplicó el descuento. Sólo el remanente queda disponible para otra liquidación.')
g.screen('4. Registrar el pago realizado','Primero seleccioná el LOG y el importe a aplicar en la tabla. Después completá este formulario.','07-pago.png',[(1,.42,.58),(2,.88,.58),(3,.20,.84)],[
 ('Fecha efectiva','Indicá cuándo se entregó el efectivo o se realizó la transferencia; puede ser posterior al servicio.'),('Cuenta de salida','Elegí de dónde salió el dinero. El medio se determina automáticamente: efectivo para caja y transferencia para banco o cuenta virtual.'),('Registrar y comprobar','En esta revisión dice Registrar pago de prueba. En operación dice Registrar pago y vincular servicios. No ejecuta una transferencia bancaria.')], 'Pago parcial del ejemplo: de $180.000 pendientes se abonan $100.000 y quedan $80.000. Se pueden agrupar LOG del mismo responsable, indicando cuánto se aplica a cada uno.')
g.screen('5. Vincular un PAG que ya existe','Revisar / vincular pago > Avanzado: distribuir un pago ya registrado.','06-pag-existente.png',[(1,.50,.25),(2,.47,.53),(3,.47,.67),(4,.20,.93)],[
 ('Buscar el movimiento','Pegá el código PAG de Movimientos. Usá esta opción cuando el egreso ya fue cargado.'),('Aplicar al servicio actual','De los $200.000 del PAG de ejemplo, se atribuyen $180.000 al saldo de LOG_DEMO_2.'),('Separar el concepto anterior','Los otros $20.000 corresponden al extra de LOG_DEMO_3. Confirmá antes ese adicional en su LOG original.'),('Comprobar y confirmar','Por distribuir debe quedar en $0. Guardá el desglose: se vincula el PAG existente sin crear otro egreso.')], 'El desglose vincula el movimiento existente y no crea otro egreso. Puede cubrir servicios de fechas diferentes. Si aparece una discrepancia, revisá el comprobante antes de confirmar.')
g.page('6. Comprobar saldos y resolver excepciones','El costo del servicio y el dinero entregado responden a conceptos distintos.')
rows=[('Flete de $300.000 + faltante de $20.000','Costo: $300.000. Compensación: $20.000. Neto: $280.000. No crear un ingreso ficticio por el recupero.'),('Pago parcial','Si se abonan $100.000 de ese neto, el saldo es $180.000. El costo completo del servicio sigue siendo $300.000.'),('LOG pagado + extra posterior de $20.000','Confirmar el extra sobre el LOG original. Conservar lo pagado y cancelar sólo el adicional pendiente.'),('Pago conjunto de varios servicios','Agrupar al mismo fletero o empresa y atribuir un importe a cada LOG. Conservar el costo de cada servicio por separado.'),('Pago en Caja por vincular','Identificar o importar el movimiento real y vincularlo. No volver a pagarlo para quitar el pendiente.'),('Diferencia de hasta $500 inclusive','Tesorería puede usar Aceptar diferencia y dejar liquidado. Queda un asiento en el LOG; se conservan el costo y el pago real sin crear otro PAG.')]
for i,(head,body) in enumerate(rows):g.box(M+(i%2)*(CW/2+10),132+(i//2)*113,CW/2-12,94,head,body)
g.screen('Aceptar una diferencia menor','Revisar / vincular pago > Cerrar una diferencia menor. Sólo Tesorería.','09-diferencia.png',[(1,.40,.48),(2,.18,.77)],[
 ('Comprobar la diferencia','La opción aparece con un pago registrado, importe confirmado y diferencia de hasta $500 inclusive. No reemplaza la revisión de un faltante o un concepto pendiente.'),('Aceptar y cerrar','Aceptar diferencia y dejar liquidado conserva el costo, el importe abonado y el asiento de la decisión en el LOG. No crea otro PAG.')], 'Ejemplo: servicio $266.500 y pago real $266.000. Se aceptan $500 y el LOG sale de pendientes. Si después se confirma un extra de $1.000, sólo vuelve a quedar pendiente ese adicional, conservando la diferencia aceptada.')

g.page('7. Del cierre a la liquidación','Confirmar el valor del servicio y registrar el dinero abonado son pasos distintos.')
steps=[('1. Confirmar el servicio','Comprobá costo, extras y compensaciones. Confirmar valor y saldo deja preparado el neto a pagar; todavía no crea un PAG.'),('2. Registrar el dinero entregado','Seleccioná LOG, importe, fecha efectiva y cuenta de salida. Registrar pago genera el movimiento PAG y su vínculo con cada servicio.'),('3. Evitar pagos duplicados','Si el dinero ya está registrado en Movimientos, vinculá ese PAG desde Avanzado. Un servicio sin saldo sale de pendientes y no se puede seleccionar para volver a pagarlo.'),('4. Conservar pagos parciales','Si se abona una parte, el saldo sigue pendiente. Un extra posterior en un LOG liquidado vuelve a revisión sólo por el adicional.'),('5. Aceptar una diferencia menor','Con un pago registrado y una diferencia de hasta $500 inclusive, revisá el motivo y aceptala explícitamente. Ejemplo: costo $266.500, pago $266.000, diferencia aceptada $500.'),('6. Leer origen y aplicación','Una novedad mantiene el LOG donde se originó; puede descontarse en otro servicio del mismo responsable. La tabla muestra ambos vínculos y el remanente disponible.')]
for i,(head,body) in enumerate(steps):g.box(M+(i%2)*(CW/2+10),132+(i//2)*113,CW/2-12,94,head,body)

g.page('8. Tarifas y control antes de pagar','La fecha del servicio determina la tarifa; el día de pago determina cuándo salió el dinero.')
tariff_checks=[('Tarifa del servicio','Revisá fletero o empresa, fecha, km incluidos, valor del excedente y acompañante. Contrastá con lo efectivamente realizado.'),('Empresa y chofer','GyV y GV corresponden a la misma empresa. Conservá el chofer y el LOG de cada servicio; confirmá quién responde por cada deuda personal.'),('Acompañante y peajes','Comprobá lo pactado en la tarifa o acuerdo. Si se pagan a otra persona, dejá identificado el concepto y su comprobante.'),('Cambio permanente de tarifa','Pedí al administrador que cree una versión con fecha de vigencia, titular y valores. No usar la tarifa nueva para reemplazar acuerdos de servicios anteriores.'),('Viaje negociado','Verificá el importe base acordado y los extras por separado. Si no está claro qué incluye, consultá a Logística antes de confirmar el valor.'),('Control de cierre financiero','Comprobá el PAG, cuenta, fecha, importe real y reparto por LOG. Un servicio parcial permanece pendiente; Liquidada indica que no resta saldo confirmado.')]
for i,(head,body) in enumerate(tariff_checks):g.box(M+(i%2)*(CW/2+10),132+(i//2)*113,CW/2-12,94,head,body)
admin_result=g.save()

import sys
flow_result=None
if '--manuals-only' not in sys.argv:
    g=Guide('diagramas-circuito-fletes.pdf','MAPA DEL CIRCUITO');g.flow('logistics');g.flow('admin');g.total();flow_result=g.save()
import json
print(json.dumps([r for r in [log_result,admin_result,flow_result] if r],ensure_ascii=False,indent=2))
