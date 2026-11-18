export function deriveMissionTelemetry(execution, sample) {
  if (!execution || !sample) throw Error('Falta un estado de misión reproducible.');
  const engineering = execution.evaluation.engineering;
  const nominalGenerationW = engineering.generationW;
  const idleConsumptionW = engineering.idlePowerW;
  const netNominalW = nominalGenerationW - idleConsumptionW;
  const objectiveTime = execution.transfer.target === 'flyby'
    ? execution.transfer.closestApproach.elapsedSeconds : execution.transfer.flightSeconds;
  const objectiveReached = sample.elapsedSeconds >= objectiveTime
    && (execution.transfer.target !== 'flyby' || execution.transfer.flybyResolved);
  return {
    missionName: execution.name,
    probeName: execution.design.name,
    propagated: {
      jdTdb: sample.jdTdb,
      positionKm: sample.positionKm,
      velocityKmS: sample.velocityKmS,
      moonPositionKm: sample.moonPositionKm,
      moonVelocityKmS: sample.moonVelocityKmS
    },
    derived: {
      earthDistanceKm: sample.earthDistanceKm,
      earthAltitudeKm: sample.earthAltitudeKm,
      lunarDistanceKm: sample.lunarDistanceKm,
      lunarAltitudeKm: sample.lunarAltitudeKm,
      lunarRelativeSpeedKmS: sample.lunarRelativeSpeedKmS
    },
    resources: {
      massKg: sample.massKg, dryMassKg: sample.dryMassKg,
      fuelKg: sample.fuelKg, fuelConsumedKg: sample.fuelConsumedKg,
      executedDeltaVMS: sample.executedDeltaVMS,
      pendingDeltaVMS: sample.pendingDeltaVMS,
      maneuverState: sample.maneuverState
    },
    energyEstimate: {
      nominalGenerationW, idleConsumptionW, netNominalW,
      batteryCapacityWh: engineering.batteryWh,
      batteryChargeWh: null,
      warning: netNominalW < 0
        ? 'Déficit de potencia nominal; no se propaga el estado de carga de la batería.'
        : 'Generación nominal a 1 AU con iluminación directa; sombras y orientación no calculadas.'
    },
    phase: sample.phase,
    elapsedSeconds: sample.elapsedSeconds,
    remainingSeconds: sample.remainingSeconds,
    objectiveReached,
    missionSuccess: null,
    provenance: {
      spacecraft: 'Estados DOPRI54 e interpolación Hermite de posición y velocidad.',
      moon: 'Horizons geocéntrico interpolado en TDB dentro de cobertura.',
      resources: 'Presupuesto impulsivo ideal del plan; sin dinámica de empuje ni descarga de batería.'
    }
  };
}
