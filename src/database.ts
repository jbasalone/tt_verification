import { Sequelize, DataTypes, Model } from "sequelize";

// Initialize Sequelize
const sequelize = new Sequelize({
    dialect: "sqlite",
    storage: "roles.sqlite",
    logging: false, // Enable SQL query logging
});

// Role configuration model
export class RoleConfig extends Model {
    declare guildId: string;
    declare min: number;
    declare max: number | null; // Null represents open-ended range
    declare roleId: string;
}

RoleConfig.init(
    {
        guildId: { type: DataTypes.STRING, allowNull: false },
        min: { type: DataTypes.INTEGER, allowNull: false },
        max: { type: DataTypes.INTEGER, allowNull: true },
        roleId: { type: DataTypes.STRING, allowNull: false },
    },
    {
        sequelize,
        modelName: "RoleConfig",
        timestamps: true,
    }
);

// Guild configuration model with custom prefix support
export class GuildConfig extends Model {
    declare guildId: string;
    declare verificationChannelId: string | null;
    declare prefix: string | null; // Added custom prefix support
}

GuildConfig.init(
    {
        guildId: { type: DataTypes.STRING, allowNull: false, unique: true },
        verificationChannelId: { type: DataTypes.STRING, allowNull: true },
        prefix: { type: DataTypes.STRING, allowNull: true, defaultValue: "ep" }, // Default prefix
    },
    {
        sequelize,
        modelName: "GuildConfig",
        timestamps: true,
    }
);

// ✅ Set custom prefix for a guild
export async function setPrefix(guildId: string, newPrefix: string): Promise<void> {
    let config = await GuildConfig.findOne({ where: { guildId } });

    if (config) {
        config.prefix = newPrefix;
        await config.save();
    } else {
        await GuildConfig.create({ guildId, prefix: newPrefix, verificationChannelId: null });
    }

    console.log(`Prefix for guild ${guildId} set to: ${newPrefix}`);
}

// ✅ Get custom prefix for a guild (default to "ep" if not set)
export async function getPrefix(guildId: string): Promise<string> {
    const config = await GuildConfig.findOne({ where: { guildId } });
    return config?.prefix || "ep"; // Default prefix if not set
}

// ✅ Set verification channel for a guild
export async function setVerificationChannel(guildId: string, channelId: string): Promise<void> {
    let config = await GuildConfig.findOne({ where: { guildId } });

    if (config) {
        config.verificationChannelId = channelId;
        await config.save();
    } else {
        await GuildConfig.create({ guildId, verificationChannelId: channelId, prefix: "ep" });
    }

    console.log(`Verification channel for guild ${guildId} set to: ${channelId}`);
}

// ✅ Get verification channel for a guild
export async function getVerificationChannel(guildId: string): Promise<string | null> {
    const config = await GuildConfig.findOne({ where: { guildId } });
    return config?.verificationChannelId || null;
}

// Initialize database and synchronize models
export async function initDatabase(): Promise<void> {
    try {
        await sequelize.sync({ alter: true }); // Update schema without dropping data
        console.log("Database initialized!");
    } catch (error) {
        console.error("Error initializing database:", error);
    }
}

export { sequelize };