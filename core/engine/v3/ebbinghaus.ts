/**
 * Curva de Olvido y Consolidación (Ebbinghaus) v3
 * Integración con Gemini AI (Google) para comprensión de contexto.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import * as dotenv from 'dotenv';

// Cargar variables de entorno (asegurar que GEMINI_API_KEY esté en el archivo .env)
dotenv.config();

// Inicializar el cliente de Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

export interface EbbinghausMemory {
  id: string;
  content: string; // El contenido textual de la memoria
  weight: number;
  lastAccessedAt: Date;
  createdAt: Date;
}

/**
 * Recalcula el peso de la memoria basado en el tiempo transcurrido
 * Fórmula simplificada: R = e^(-t/S)
 */
export function calculateDecay(
  memory: EbbinghausMemory,
  currentTime: Date = new Date()
): number {
  const timeDiffMs = currentTime.getTime() - memory.lastAccessedAt.getTime();
  const timeDiffDays = timeDiffMs / (1000 * 60 * 60 * 24);

  // S representa la fuerza (strength) original. Constante de 7 días.
  const strength = 7;
  const newWeight = Math.exp(-timeDiffDays / strength);

  return newWeight;
}

/**
 * Usa Gemini para leer una serie de logs o recuerdos de Working/Episodic Memory
 * y comprimirlos en una o dos reglas semánticas permanentes.
 */
async function consolidateWithGemini(memories: string[]): Promise<string> {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY no está configurada en el archivo .env');
  }

  // Usamos el modelo Gemma 4 31B IT (256K de contexto) a través de Google AI Studio
  const model = genAI.getGenerativeModel({ model: 'gemma-4-31b-it' });

  const prompt = `
  Eres el núcleo subconsciente de memoria de un sistema de IA avanzado (ALiHaneD).
  A continuación te proporcionaré un listado de observaciones de memoria a corto plazo (Working Memory).
  Tu tarea es extraer el conocimiento fundamental, las reglas aprendidas o los hechos relevantes y resumirlos en un solo párrafo claro y conciso (Semantic Memory).
  Ignora los errores temporales, los datos irrelevantes y el "ruido". Quédate solo con el "zumo" del conocimiento.

  Observaciones:
  ${memories.join('\n- ')}

  Resumen semántico:
  `;

  try {
    const result = await model.generateContent(prompt);
    const response = await result.response;
    return response.text();
  } catch (error) {
    console.error('Error al invocar a Gemini para consolidación:', error);
    throw error;
  }
}

/**
 * Función que invocará NeuroGestor en un Cron Job nocturno.
 * Limpia y comprime memorias episódicas a semánticas.
 */
export async function runConsolidationSweep(mockMemories: EbbinghausMemory[]): Promise<void> {
  console.log('🧹 Iniciando consolidación de memoria con Gemini...');

  const memoriesToConsolidate: string[] = [];

  for (const memory of mockMemories) {
    const newWeight = calculateDecay(memory);

    console.log(`Evaluando memoria ${memory.id}: Peso actual -> ${newWeight.toFixed(2)}`);

    if (newWeight < 0.1) {
      console.log(`🗑️ [Olvido] Memoria ${memory.id} eliminada (peso muy bajo).`);
      // db.delete(episodicMemory).where(eq(episodicMemory.id, memory.id))
    } else if (newWeight > 0.8) {
      console.log(`🧠 [Retención] Memoria ${memory.id} lista para consolidar a Semántica.`);
      memoriesToConsolidate.push(memory.content);
    }
  }

  // Si hay recuerdos valiosos, le pedimos a Gemini que los comprima
  if (memoriesToConsolidate.length > 0) {
    console.log(`Procesando ${memoriesToConsolidate.length} observaciones con Gemini Flash...`);
    const semanticFact = await consolidateWithGemini(memoriesToConsolidate);

    console.log('====================================');
    console.log('✨ NUEVA REGLA SEMÁNTICA (Consolidada):');
    console.log(semanticFact);
    console.log('====================================');

    // db.insert(semanticMemory).values({ concept: 'Consolidación Nocturna', fact: semanticFact, ... })
  }

  console.log('✅ Consolidación completada.');
}
