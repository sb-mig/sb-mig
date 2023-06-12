export const removeIdFromPreset = (preset: any) => {
    // TODO: probably change to some better options - deleting is very slow
    delete preset.preset.id;
    delete preset.preset.space_id;
    delete preset.preset.component_id;

    return preset;
};
