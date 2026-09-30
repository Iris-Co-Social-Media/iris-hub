-- =============================================================================
-- V1-alpha · Historias: tipo de historia (Imagen / Serie de imágenes / Video)
-- Fuente de verdad: docs/ARQUITECTURA.md (secciones 5 y 6.2, tabla `pieces`).
--
-- Por qué hace falta: el formato `story` no dice si la historia es una imagen,
-- una serie de imágenes o un video, y "Video" no se puede deducir de ningún
-- otro dato. La cantidad de imágenes de una serie NO se guarda acá: son las
-- pantallas de la pieza (piece_frames). Lo único que se guarda es si la serie
-- se eligió como "8 o más" (story_images_open), porque con exactamente 8
-- pantallas no se distingue de "8".
--
-- Solo agrega un tipo y dos columnas. No cambia permisos (GRANT) ni
-- políticas (RLS): los permisos de `pieces` son sobre toda la tabla. Las
-- historias que ya existen quedan con story_type = null ("sin especificar").
-- =============================================================================

create type public.story_type as enum ('image', 'image_series', 'video');

alter table public.pieces add column story_type public.story_type;

-- Solo las historias tienen tipo de historia.
alter table public.pieces add constraint pieces_story_type_only_stories check (
  story_type is null or format = 'story'
);

comment on column public.pieces.story_type is
  'Tipo de historia (solo si format = story): image Imagen · image_series Serie de imágenes · video Video. Null = sin especificar.';

-- "8 o más": la serie empieza con 8 pantallas y se le pueden agregar más.
alter table public.pieces add column story_images_open boolean not null default false;

alter table public.pieces add constraint pieces_story_images_open_only_series check (
  not story_images_open or story_type = 'image_series'
);

comment on column public.pieces.story_images_open is
  'Serie de imágenes elegida como "8 o más" (la cantidad real son las pantallas).';
