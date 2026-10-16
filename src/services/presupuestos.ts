import { api } from '../api';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';

// ===== FUNCIONES CRUD PRESUPUESTOS =====

export const listPresupuestos = async () => {
  try {
    const response = await api.get('/presupuestos');
    return response.data;
  } catch (error) {
    console.error('Error al listar presupuestos:', error);
    throw error;
  }
};

export const getPresupuesto = async (id: number) => {
  try {
    const response = await api.get(`/presupuestos/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error al obtener presupuesto:', error);
    throw error;
  }
};

export const createPresupuesto = async (data: any) => {
  try {
    const response = await api.post('/presupuestos', data);
    return response.data;
  } catch (error) {
    console.error('Error al crear presupuesto:', error);
    throw error;
  }
};

export const updatePresupuesto = async (id: number, data: any) => {
  try {
    const response = await api.put(`/presupuestos/${id}`, data);
    return response.data;
  } catch (error) {
    console.error('Error al actualizar presupuesto:', error);
    throw error;
  }
};

export const deletePresupuesto = async (id: number) => {
  try {
    const response = await api.delete(`/presupuestos/${id}`);
    return response.data;
  } catch (error) {
    console.error('Error al eliminar presupuesto:', error);
    throw error;
  }
};

// ===== FUNCIONES DE GENERACIÓN DE PDF =====

/**
 * Convierte inputs a texto visible antes de capturar
 */
const convertInputsToText = (element: HTMLElement): Map<HTMLInputElement | HTMLTextAreaElement, string> => {
  const originalValues = new Map<HTMLInputElement | HTMLTextAreaElement, string>();
  
  // Obtener todos los inputs y textareas
  const inputs = element.querySelectorAll('input:not([type="file"]):not([type="checkbox"]), textarea');
  
  inputs.forEach((inputElement) => {
    const input = inputElement as HTMLInputElement | HTMLTextAreaElement;
    
    if (input.value && input.value.trim()) {
      // Guardar el input original
      originalValues.set(input, input.outerHTML);
      
      // Crear un div con el valor como texto
      const textDiv = document.createElement('div');
      textDiv.textContent = input.value;
      
      // Copiar estilos relevantes del input
      const computedStyle = window.getComputedStyle(input);
      textDiv.style.cssText = `
        width: ${input.offsetWidth}px;
        height: ${input.offsetHeight}px;
        padding: ${computedStyle.padding};
        font-size: ${computedStyle.fontSize};
        font-family: ${computedStyle.fontFamily};
        font-weight: ${computedStyle.fontWeight};
        color: ${computedStyle.color};
        background: ${computedStyle.backgroundColor};
        border: ${computedStyle.border};
        border-radius: ${computedStyle.borderRadius};
        box-sizing: border-box;
        display: flex;
        align-items: center;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        line-height: ${computedStyle.lineHeight};
      `;
      
      // Reemplazar el input con el div
      input.parentNode?.replaceChild(textDiv, input);
    }
  });
  
  return originalValues;
};

/**
 * Restaura los inputs originales
 */
const restoreInputs = (originalValues: Map<HTMLInputElement | HTMLTextAreaElement, string>, element: HTMLElement) => {
  originalValues.forEach((originalHTML, originalElement) => {
    // Encontrar el div que reemplazó al input
    const textDivs = element.querySelectorAll('div');
    textDivs.forEach((div) => {
      if (div.textContent === originalElement.value) {
        // Crear nuevo input desde el HTML original
        const temp = document.createElement('div');
        temp.innerHTML = originalHTML;
        const newInput = temp.firstChild;
        
        if (newInput) {
          div.parentNode?.replaceChild(newInput, div);
        }
      }
    });
  });
};

/**
 * Genera un PDF desde el modal de presupuesto personalizado (VERSIÓN MEJORADA)
 * Convierte inputs a texto antes de capturar para evitar texto cortado
 * @param elementId - ID del contenedor del presupuesto
 * @param clientName - Nombre del cliente para el archivo
 */
export const generarPresupuestoPDFDesdeModal = async (
  elementId: string, 
  clientName: string = 'cliente'
): Promise<void> => {
  try {
    const element = document.getElementById(elementId);
    
    if (!element) {
      throw new Error(`No se encontró el elemento con ID: ${elementId}`);
    }

    console.log('📸 Preparando presupuesto para captura...');

    // 1. Ocultar botones y elementos que no deben aparecer
    const buttonsToHide = element.querySelectorAll('button, .no-print');
    buttonsToHide.forEach((btn: any) => {
      btn.style.visibility = 'hidden';
    });

    // 2. Convertir inputs a texto visible
    const originalInputs = convertInputsToText(element);

    // 3. Esperar un momento para que se apliquen los cambios
    await new Promise(resolve => setTimeout(resolve, 200));

    console.log('📸 Capturando presupuesto...');

    // 4. Capturar el contenido con configuración optimizada
    const canvas = await html2canvas(element, {
      scale: 3, // Mayor resolución para mejor calidad
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      imageTimeout: 0,
      allowTaint: true,
      foreignObjectRendering: false, // Desactivar para mejor compatibilidad
    });

    // 5. Restaurar inputs originales
    restoreInputs(originalInputs, element);

    // 6. Restaurar visibilidad de botones
    buttonsToHide.forEach((btn: any) => {
      btn.style.visibility = 'visible';
    });

    console.log('📄 Generando PDF...');

    // 7. Crear PDF con mejor calidad
    const imgWidth = 210; // A4 width en mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgData = canvas.toDataURL('image/png', 1.0);
    
    // 8. Dividir en múltiples páginas si es necesario
    let heightLeft = imgHeight;
    let position = 0;
    const pageHeight = 297; // A4 height en mm
    
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    
    // 9. Sanitizar nombre del cliente para el archivo
    const sanitizedName = clientName
      .replace(/[^a-zA-Z0-9\s]/g, '_')
      .toLowerCase()
      .replace(/\s+/g, '_');
    
    const fileName = `presupuesto_${sanitizedName}_${new Date().toISOString().slice(0, 10)}`;
    
    // 10. Descargar el PDF
    pdf.save(`${fileName}.pdf`);
    
    console.log('✅ PDF generado exitosamente:', fileName);
  } catch (error) {
    console.error('❌ Error al generar PDF desde modal:', error);
    throw error;
  }
};

/**
 * Genera un PDF desde un elemento HTML visible en pantalla
 * @param elementId - ID del elemento HTML a capturar
 * @param fileName - Nombre del archivo PDF (sin extensión)
 */
export const generarPresupuestoPDF = async (elementId: string, fileName: string = 'presupuesto'): Promise<void> => {
  try {
    const element = document.getElementById(elementId);
    
    if (!element) {
      throw new Error(`No se encontró el elemento con ID: ${elementId}`);
    }

    // Configuración para mejorar la calidad de captura
    const canvas = await html2canvas(element, {
      scale: 3,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      imageTimeout: 0,
      removeContainer: false,
      foreignObjectRendering: false,
    });

    // Obtener dimensiones del canvas
    const imgWidth = 210; // A4 width en mm
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    
    // Crear PDF
    const pdf = new jsPDF('p', 'mm', 'a4');
    const imgData = canvas.toDataURL('image/png', 1.0);
    
    // Si la imagen es más alta que una página, dividir en múltiples páginas
    let heightLeft = imgHeight;
    let position = 0;
    
    pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
    heightLeft -= 297; // Altura de página A4
    
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
      heightLeft -= 297;
    }
    
    // Descargar el PDF
    pdf.save(`${fileName}_${new Date().toISOString().slice(0, 10)}.pdf`);
    
    console.log('✅ PDF generado exitosamente');
  } catch (error) {
    console.error('❌ Error al generar PDF:', error);
    throw error;
  }
};

/**
 * Genera un PDF con plantilla predefinida (para futuras mejoras)
 * @param data - Datos del presupuesto
 */
export const generarPresupuestoPlantilla = async (data: any): Promise<void> => {
  try {
    const pdf = new jsPDF('p', 'mm', 'a4');
    
    // Header
    pdf.setFontSize(20);
    pdf.setTextColor(40, 40, 40);
    pdf.text('PRESUPUESTO', 105, 20, { align: 'center' });
    
    // Información del cliente
    pdf.setFontSize(12);
    pdf.text(`Cliente: ${data.clientName || 'N/A'}`, 20, 40);
    pdf.text(`Teléfono: ${data.telefono || 'N/A'}`, 20, 50);
    pdf.text(`Fecha: ${new Date().toLocaleDateString('es-AR')}`, 20, 60);
    
    // Línea separadora
    pdf.setLineWidth(0.5);
    pdf.line(20, 70, 190, 70);
    
    // Información del vehículo
    pdf.setFontSize(14);
    pdf.setTextColor(0, 51, 153);
    pdf.text('VEHÍCULO', 20, 80);
    
    pdf.setFontSize(11);
    pdf.setTextColor(40, 40, 40);
    pdf.text(`Marca: ${data.marca || 'N/A'}`, 20, 90);
    pdf.text(`Modelo: ${data.modelo || 'N/A'}`, 20, 100);
    pdf.text(`Precio: ${data.precio || 'N/A'}`, 20, 110);
    
    // Footer
    pdf.setFontSize(8);
    pdf.setTextColor(128, 128, 128);
    pdf.text('Este presupuesto tiene validez de 72 horas', 105, 280, { align: 'center' });
    
    // Guardar
    pdf.save(`presupuesto_${data.clientName}_${new Date().getTime()}.pdf`);
    
    console.log('✅ PDF con plantilla generado exitosamente');
  } catch (error) {
    console.error('❌ Error al generar PDF con plantilla:', error);
    throw error;
  }
};