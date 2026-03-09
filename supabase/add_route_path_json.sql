ALTER TABLE public.routes
ADD COLUMN IF NOT EXISTS path_json jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.routes.path_json IS 'Stored route geometry vertices for freehand and mixed routes';
