-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Usuario" (
    "id" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "elo" INTEGER NOT NULL DEFAULT 1200,
    "partidasJugadas" INTEGER NOT NULL DEFAULT 0,
    "partidasGanadas" INTEGER NOT NULL DEFAULT 0,
    "creadoEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizadoEn" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Usuario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partida" (
    "id" TEXT NOT NULL,
    "plantilla" TEXT NOT NULL,
    "numeroJugadores" INTEGER NOT NULL,
    "turnos" INTEGER NOT NULL,
    "ganadorNombre" TEXT NOT NULL,
    "terminadaEn" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Partida_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participacion" (
    "id" TEXT NOT NULL,
    "partidaId" TEXT NOT NULL,
    "usuarioId" TEXT NOT NULL,
    "puntos" INTEGER NOT NULL,
    "posicion" INTEGER NOT NULL,
    "eloAntes" INTEGER NOT NULL,
    "eloDespues" INTEGER NOT NULL,

    CONSTRAINT "Participacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Usuario_nombre_key" ON "Usuario"("nombre");

-- CreateIndex
CREATE INDEX "Participacion_usuarioId_idx" ON "Participacion"("usuarioId");

-- CreateIndex
CREATE UNIQUE INDEX "Participacion_partidaId_usuarioId_key" ON "Participacion"("partidaId", "usuarioId");

-- AddForeignKey
ALTER TABLE "Participacion" ADD CONSTRAINT "Participacion_partidaId_fkey" FOREIGN KEY ("partidaId") REFERENCES "Partida"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participacion" ADD CONSTRAINT "Participacion_usuarioId_fkey" FOREIGN KEY ("usuarioId") REFERENCES "Usuario"("id") ON DELETE CASCADE ON UPDATE CASCADE;
