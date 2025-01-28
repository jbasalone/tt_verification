import { Sequelize, DataTypes, Model } from "sequelize";

const sequelize = new Sequelize({
    dialect: "sqlite",
    storage: "roles.sqlite",
    logging: false,
});

class GuildConfig extends Model {
    declare guildId: string;
    declare verificationChannelId: string | null;
}

GuildConfig.init(
    {
        guildId: {
            type: DataTypes.STRING,
            allowNull: false,
            unique: true,
        },
        verificationChannelId: {
            type: DataTypes.STRING,
            allowNull: true,
        },
    },
    { sequelize, modelName: "GuildConfig" }
);

export async function setVerificationChannel(
    guildId: string,
    channelId: string
): Promise<void> {
    const config = await GuildConfig.findOne({ where: { guildId } });

    if (config) {
        config.verificationChannelId = channelId;
        await config.save();
    } else {
        await GuildConfig.create({ guildId, verificationChannelId: channelId });
    }
}

export async function getVerificationChannel(
    guildId: string
): Promise<string | null> {
    const config = await GuildConfig.findOne({ where: { guildId } });
    return config?.verificationChannelId || null;
}

export { GuildConfig, sequelize };