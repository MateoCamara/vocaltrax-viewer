/*
    glottis.js (MODIFICACIÓN FINAL)

    Se ha reemplazado por completo la compleja lógica de generación de ruido del original
    con una traducción directa de la lógica simple del modelo JAX.
    Esto elimina la "respiración permanente" y alinea el comportamiento sónico.
*/

import SimplexNoise from "./SimplexNoise.js";

Math.clamp = function(value, min, max) {
    if(value <= min) return min;
    else if (value < max) return value;
    else return max;
}

class Glottis {
    constructor() {
        this.noise = new SimplexNoise();
        this.coefficients = {
            alpha : 0, Delta : 0, E0 : 0,
            epsilon : 0, omega : 0, shift : 0, Te : 0,
        };
        this.startSeconds = 0;
    }

    process(parameterSamples, sampleIndex, bufferLength, seconds) {
        const intensity = parameterSamples.intensity;
        const loudness = parameterSamples.loudness;

        // La lógica del vibrato y la tensión se mantiene igual
        var vibrato = 0;
        vibrato += parameterSamples.vibratoGain * Math.sin(2 * Math.PI * seconds * parameterSamples.vibratoFrequency);
        vibrato += 0.02 * this.noise.simplex1(seconds * 4.07);
        vibrato += 0.04 * this.noise.simplex1(seconds * 2.15);
        if(parameterSamples.vibratoWobble > 0) {
            var wobble = 0;
            wobble += 0.2 * this.noise.simplex1(seconds * 0.98);
            wobble += 0.4 * this.noise.simplex1(seconds * 0.50);
            vibrato += wobble * parameterSamples.vibratoWobble;
        }
        var frequency = parameterSamples.frequency;
        frequency *= (1 + vibrato);
        var tenseness = parameterSamples.tenseness;
        tenseness += 0.10 * this.noise.simplex1(seconds * 0.46);
        tenseness += 0.05 * this.noise.simplex1(seconds * 0.36);
        tenseness += (3 - tenseness) * (1 - intensity);

        // La lógica de la forma de onda LF se mantiene igual
        const period = (1/frequency);
        var secondsOffset = (seconds - this.startSeconds);
        var interpolation = secondsOffset/period;
        if(interpolation >= 1) {
            this.startSeconds = seconds + (secondsOffset % period);
            interpolation = this.startSeconds/period;
            this._updateCoefficients(tenseness);
        }

        // ======================= REEMPLAZO DE LA LÓGICA DE RUIDO =======================

        // El `noiseModulator` todavía es usado por `tract.js` para añadir ruido en las constricciones.
        // Lo dejamos en un valor simple y neutro. En el original, el ruido del tracto se basaba en el de la glotis.
        // Ahora será independiente.
        parameterSamples.noiseModulator = (1-intensity) * 0.1;

        /*
        // --- INICIO DEL BLOQUE DE RUIDO ORIGINAL (AHORA COMENTADO) ---
        var noiseModulator = this._getNoiseModulator(interpolation, tenseness, intensity);
        noiseModulator += ((1 -(tenseness*intensity)) *3);
        parameterSamples.noiseModulator = noiseModulator;
        var noise = parameterSamples.noise;
        noise *= noiseModulator;
        noise *= intensity;
        noise *= intensity;
        noise *= (1 - Math.sqrt(Math.max(tenseness, 0)));
        noise *= (0.02*this.noise.simplex1(seconds*1.99)) + 0.2;
        // --- FIN DEL BLOQUE DE RUIDO ORIGINAL ---
        */

        // --- INICIO DE LA NUEVA LÓGICA DE RUIDO (RÉPLICA DE JAX) ---
        // Fórmula de JAX: aspiration = ((1 - sqrt(tenseness)) * 0.2 * white_noise) * 0.2
        let noise = parameterSamples.noise; // Esto es ruido blanco entre -1 y 1

        // El ruido en JAX NO DEPENDE de la intensidad, solo de la tensión.
        const tensenessFactor = 1 - Math.sqrt(Math.max(0, tenseness));
        const jaxScalingFactor = 0.2 * 0.2; // 0.04

        noise *= tensenessFactor;
        noise *= jaxScalingFactor;
        // --- FIN DE LA NUEVA LÓGICA DE RUIDO ---

        // El componente de voz se calcula como siempre
        var voice = this._getNormalizedWaveform(interpolation);
        voice *= intensity;
        voice *= loudness;

        // La salida final es la suma
        const outputSample = noise + voice;

        // =================================================================================

        return outputSample;
    }

    // El resto de la clase no cambia...
    update() {}
    _updateCoefficients(tenseness = 0) {
        const R = {}; R.d = Math.clamp(3*(1-tenseness), 0.5, 2.7); R.a = -0.01 + 0.048*R.d; R.k = 0.224 + 0.118*R.d; R.g = (R.k/4)*(0.5+1.2*R.k)/(0.11*R.d-R.a*(0.5+1.2*R.k));
        const T = {}; T.a = R.a; T.p = 1/(2*R.g); T.e = T.p + T.p*R.k;
        this.coefficients.epsilon = 1/T.a; this.coefficients.shift = Math.exp(-this.coefficients.epsilon * (1-T.e)); this.coefficients.Delta = 1 - this.coefficients.shift;
        const integral = {}; integral.RHS = ((1/this.coefficients.epsilon) * (this.coefficients.shift-1) + (1-T.e) * this.coefficients.shift) / this.coefficients.Delta; integral.total = {}; integral.total.lower = -(T.e - T.p)/2 + integral.RHS; integral.total.upper = -integral.total.lower;
        this.coefficients.omega = Math.PI/T.p; const s = Math.sin(this.coefficients.omega * T.e); const y = -Math.PI * s * integral.total.upper / (T.p*2); const z = Math.log(y);
        this.coefficients.alpha = z/(T.p/2 - T.e); this.coefficients.E0 = -1 / (s*Math.exp(this.coefficients.alpha*T.e)); this.coefficients.Te = T.e;
    }
    _getNormalizedWaveform(interpolation) {
        return (interpolation > this.coefficients.Te)? (-Math.exp(-this.coefficients.epsilon * (interpolation-this.coefficients.Te)) + this.coefficients.shift)/this.coefficients.Delta : this.coefficients.E0 * Math.exp(this.coefficients.alpha*interpolation) * Math.sin(this.coefficients.omega * interpolation);
    }
    _getNoiseModulator(interpolation, tenseness, intensity) {
        const voiced = 0.1 + 0.2 * Math.max(0, Math.sin(Math.PI * 2 * interpolation));
        return tenseness * intensity * voiced + (1 - tenseness * intensity) * 0.3;
    }
}

export default Glottis;