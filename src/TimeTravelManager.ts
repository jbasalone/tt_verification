import { GuildMember, EmbedBuilder, Role, TextChannel, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } from "discord.js";
import { Op } from "sequelize";
import { GuildConfig, RoleConfig } from "./database";

/**
 * Assigns all appropriate roles to a member based on their time travel count.
 * @param member The guild member to assign roles to.
 * @param timeTravelCount The time travel count extracted from the embed.
 * @param channel The channel where the response should be sent.
 */
export async function assignTimeTravelRole(
    member: GuildMember,
    timeTravelCount: number,
    channel: TextChannel
): Promise<void> {
    const guild = member.guild;

    console.log(`Assigning roles for ${member.user.tag} with time travel count: ${timeTravelCount}`);

    // Fetch all roles matching the user's time travel count
    const matchingRoles = await RoleConfig.findAll({
        where: {
            guildId: guild.id,
            min: { [Op.lte]: timeTravelCount },
            [Op.or]: [{ max: { [Op.gte]: timeTravelCount } }, { max: null }],
        },
    });

    if (matchingRoles.length === 0) {
        console.log(`No matching roles found for time travel count: ${timeTravelCount}`);
        await sendRoleResponseEmbed(channel, member, [], `No roles configured for time travel count: **${timeTravelCount}**.`);
        return;
    }

    const rolesToAssign = matchingRoles
        .map((config) => guild.roles.cache.get(config.roleId))
        .filter((role): role is Role => !!role);

    if (rolesToAssign.length === 0) {
        console.log("None of the configured roles exist in the guild.");
        await sendRoleResponseEmbed(channel, member, [], "Configured roles not found in the guild.");
        return;
    }

    // Fetch all configured roles in the guild to remove conflicting ones
    const allConfiguredRoles = await RoleConfig.findAll({ where: { guildId: guild.id } });
    const conflictingRoles = allConfiguredRoles
        .map((config) => guild.roles.cache.get(config.roleId))
        .filter((role): role is Role => !!role && !rolesToAssign.includes(role));

    const currentRoles = member.roles.cache.map((role) => role.id);
    const alreadyAssignedRoles = rolesToAssign.filter((role) => currentRoles.includes(role.id));
    const rolesToRemove = conflictingRoles.filter((role) => currentRoles.includes(role.id));

    if (alreadyAssignedRoles.length === rolesToAssign.length && rolesToRemove.length === 0) {
        console.log(`User ${member.user.tag} already has all the correct roles.`);
        await sendRoleResponseEmbed(
            channel,
            member,
            alreadyAssignedRoles,
            `All configured roles are already assigned for time travel count: **${timeTravelCount}**.`
        );
        return;
    }

    // Remove conflicting roles
    if (rolesToRemove.length > 0) {
        console.log(`Removing conflicting roles: ${rolesToRemove.map((role) => role.name).join(", ")}`);
        await member.roles.remove(rolesToRemove);
    }

    // Assign all matching roles
    console.log(`Assigning roles: ${rolesToAssign.map((role) => role.name).join(", ")}`);
    await member.roles.add(rolesToAssign);

    await sendRoleResponseEmbed(channel, member, rolesToAssign, `Assigned the following roles for time travel count: **${timeTravelCount}**.`);
}

/**
 * Sends an embed to the specified channel with role assignment details and role removal buttons.
 * @param channel The channel where the response should be sent.
 * @param member The guild member to whom the embed is related.
 * @param roles The roles to include in the embed.
 * @param description The description of the embed.
 */
async function sendRoleResponseEmbed(
    channel: TextChannel,
    member: GuildMember,
    roles: Role[],
    description: string
): Promise<void> {
    const embed = new EmbedBuilder()
        .setTitle("Role Assignment")
        .setDescription(description)
        .setColor(roles.length > 0 ? "Green" : "Red")
        .setFooter({ text: `User: ${member.user.tag}`, iconURL: member.user.displayAvatarURL() });

    if (roles.length > 0) {
        embed.addFields({ name: "Roles", value: roles.map((r) => `<@&${r.id}>`).join("\n") });
    }

    const buttons = roles.map((role) =>
        new ButtonBuilder()
            .setCustomId(`removeRole_${role.id}`)
            .setLabel(`Remove ${role.name}`)
            .setStyle(ButtonStyle.Primary)
    );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);

    console.log(`Sending role response embed to channel: ${channel.name}`);
    await channel.send({ embeds: [embed], components: [row] });

    // Handle button interactions for role removal
    const collector = channel.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: 5 * 60 * 1000, // 5 minutes
    });

    collector.on("collect", async (interaction) => {
        if (!interaction.isButton()) return;

        const [action, roleId] = interaction.customId.split("_");
        if (action !== "removeRole") return;

        const roleToRemove = roles.find((r) => r.id === roleId);
        if (!roleToRemove) {
            await interaction.reply({ content: "Role not found or already removed.", ephemeral: true });
            return;
        }

        if (interaction.user.id !== member.user.id) {
            await interaction.reply({ content: "You can only remove your own roles.", ephemeral: true });
            return;
        }

        await member.roles.remove(roleToRemove);
        await interaction.reply({ content: `Removed role: **${roleToRemove.name}**`, ephemeral: true });
        console.log(`Removed role ${roleToRemove.name} from ${member.user.tag}`);
    });

    collector.on("end", () => {
        console.log("Role removal buttons expired.");
    });
}

/**
 * Registers a time travel role mapping in the database.
 * @param guildId The ID of the guild.
 * @param min The minimum time travel count.
 * @param max The maximum time travel count (or null for open-ended).
 * @param roleId The ID of the role to assign.
 */
export async function registerTimeTravelRoleMap(guildId: string, min: number, max: number | null, roleId: string): Promise<void> {
    await RoleConfig.create({ guildId, min, max, roleId });
    console.log(`Registered role ${roleId} for range ${min}-${max ?? "infinity"} in guild ${guildId}`);
}

/**
 * Deletes a role mapping from the database.
 * @param guildId The ID of the guild.
 * @param roleId The ID of the role to delete.
 */
export async function deleteRoleMapping(guildId: string, roleId: string): Promise<void> {
    await RoleConfig.destroy({ where: { guildId, roleId } });
    console.log(`Deleted role mapping for role ID ${roleId} in guild ${guildId}`);
}

/**
 * Checks if the given channel ID is the configured verification channel for the guild.
 * @param guildId The ID of the guild.
 * @param channelId The ID of the channel to check.
 */
export async function isInVerificationChannel(guildId: string, channelId: string): Promise<boolean> {
    const guildConfig = await GuildConfig.findOne({ where: { guildId } });
    return guildConfig?.verificationChannelId === channelId;
}