import { sbDeliveryApi } from "./config.js";

export const deliveryApi = {
    getAllStories: async ({ token }: { token: string }) => {
        const allStories: any = await sbDeliveryApi
            .get(`cdn/stories`, {
                per_page: 100,
                token: token,
            })
            .then((res: any) => {
                return res.data.stories;
            })
            .then((res: any) => {
                return res.map((item: any) => ({ story: item }));
            })
            .catch((err: any) => console.error(err));

        return allStories;
    },
};
