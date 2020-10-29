import storyblokComponentsConfig from "sb-mig/lib/config/StoryblokComponentsConfig";

export const isComponentAlreadyImported = ({
    componentName,
}: {
    componentName: string;
}) => {
    return storyblokComponentsConfig.getSingleData(componentName)
        .isLinkedInComponentFile;
};

interface UpdateIsLinkedInComponentFile {
    componentName: string;
    isLinkedInComponentFile: boolean;
}

export const updateIsLinkedInComponentFile = ({
    componentName,
    isLinkedInComponentFile,
}: UpdateIsLinkedInComponentFile) => {
    storyblokComponentsConfig.setSingleData({
        ...storyblokComponentsConfig.getSingleData(componentName),
        isLinkedInComponentFile,
    });
};

interface UpdateIsModified {
    componentName: string;
    modified: boolean;
}

export const updateIsModified = ({
    componentName,
    modified,
}: UpdateIsModified) => {
    storyblokComponentsConfig.setSingleData({
        ...storyblokComponentsConfig.getSingleData(componentName),
        modified,
    });
};

interface UpdateLocation {
    componentName: string;
    location: string;
}

export const updateLocation = ({ componentName, location }: UpdateLocation) => {
    storyblokComponentsConfig.setSingleData({
        ...storyblokComponentsConfig.getSingleData(componentName),
        location,
    });
};
