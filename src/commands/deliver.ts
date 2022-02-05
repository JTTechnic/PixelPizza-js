import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry, CommandOptions } from "@sapphire/framework";
import { stripIndents } from "common-tags";
import { type AutocompleteInteraction, type CommandInteraction, type Guild, type GuildTextBasedChannel, type TextChannel, ThreadChannel, type User, MessageEmbed } from "discord.js";
import { Op } from "sequelize";
import { Command } from "../lib/Command";
import type { Order } from "../lib/models/Order";
import { Util } from "../lib/Util";

enum DeliveryMethod {
	DM = "dm",
	Bot = "bot",
	Personal = "personal"
}

@ApplyOptions<CommandOptions>({
	description: "Deliver an order",
	preconditions: ["ValidOrderData", "DelivererOnly"]
})
export class DeliverCommand extends Command {
	public override registerApplicationCommands(registry: ApplicationCommandRegistry) {
		this.registerPrivateChatInputCommand(
			registry,
			this.defaultChatInputCommand
				.addStringOption((input) => input.setName("order").setDescription("The order to deliver").setRequired(true).setAutocomplete(true))
				.addStringOption((input) =>
					input
						.setName("method")
						.setDescription("The delivery method")
						.setRequired(true)
						.addChoices([
							["Direct Message", DeliveryMethod.DM],
							["Bot", DeliveryMethod.Bot],
							["Personally", DeliveryMethod.Personal]
						])
				)
		);
	}

	public override async autocompleteRun(interaction: AutocompleteInteraction) {
		const focused = interaction.options.getFocused() as string;
		const found = await this.container.stores
			.get("models")
			.get("order")
			.findAll({
				where: {
					[Op.or]: {
						id: {
							[Op.startsWith]: focused
						},
						order: {
							[Op.substring]: focused
						}
					},
					deliverer: interaction.user.id,
					status: "cooked"
				},
				order: [["id", "ASC"]]
			});
		return interaction.respond(
			found
				.map((order) => {
					const {id} = order;
					return { name: `${id} - ${order.order}`, value: id };
				})
		);
	}

	private makeDateReplacement(name: string, date: Date) {
		return {
			type: Util.makeDateRegex(name),
			replacement: (_s: string, type: string) => {
				switch(type) {
					case "date":
						return `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()} (dd-mm-YYYY)`;
					case "time":
						return `${date.getHours()}:${date.getMinutes()}:${date.getSeconds()} (HH:mm:ss)`;
					case "datetime":
					default:
						return `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()} ${date.getHours()}:${date.getMinutes()}:${date.getSeconds()} (dd-mm-YYYY HH:mm:ss)`;
				}
			}
		};
	}

	private makeUserReplacement(name: string, user: User | null, escaped: boolean, defaultValue: string) {
		return {
			type: Util.makeUserRegex(name),
			replacement: (_s: string, type: string) => {
				const addition = escaped ? "`" : "";
				const parse = () => {
					if (!user) return defaultValue;
					switch(type) {
						default:
						case "tag":
							return user.tag;
						case "id":
							return user.id;
						case "name":
						case "username":
							return user.username;
						case "ping":
						case "mention":
							return user.toString();
					}
				}
				return `${addition}${parse()}${addition}`;
			}
		};
	}

	private replace(message: string, replacements: {type: string, replacement: string | ((substring: string, ...args: any[]) => string)}[]) {
		replacements.forEach(replacement => message = typeof replacement.replacement === "string" ? message.replace(new RegExp(`{${replacement.type}}`, "g"), replacement.replacement) : message.replace(new RegExp(`{${replacement.type}}`, "g"), replacement.replacement));
		return message;
	}

	private async createDeliveryMessage(message: string, orderModel: Order, escaped: boolean) {
		const chef = await orderModel.fetchChef();
		const deliverer = await orderModel.fetchDeliverer();
		const customer = await orderModel.fetchCustomer();
		const guild = await orderModel.fetchGuild();
		const channel = await orderModel.fetchChannel();
		const inviteChannel = (await this.container.client.channels.fetch(process.env.INVITE_CHANNEL)) as TextChannel;
		const invite = await inviteChannel.createInvite({ maxAge: 0, maxUses: 1, unique: false });
		const guildName = guild ? guild.name : "Unknown Guild";
		return this.replace(message, [
			this.makeUserReplacement("chef", chef, escaped, "Unknown Chef"),
			this.makeUserReplacement("deliverer", deliverer, escaped, "Unknown Deliverer"),
			this.makeUserReplacement("customer", customer, escaped, "Unknown Customer"),
			{
				type: "image",
				replacement: orderModel.image!
			},
			{
				type: "invite",
				replacement: invite.url.replace("https://", "")
			},
			{
				type: "orderID",
				replacement: orderModel.id
			},
			{
				type: "order",
				replacement: orderModel.order
			},
			this.makeDateReplacement("order", orderModel.orderedAt),
			this.makeDateReplacement("cook", orderModel.cookedAt!),
			this.makeDateReplacement("delivery", orderModel.deliveredAt!),
			{
				type: "guild",
				replacement: guildName
			},
			{
				type: "server",
				replacement: guildName
			},
			{
				type: "channel",
				replacement: channel ? channel.name : "Unknown Channel"
			}
		]);
	}

	public get modelStore() {
		return this.container.stores.get("models");
	}

	public override async chatInputRun(interaction: CommandInteraction): Promise<any> {
		await interaction.deferReply();

		const orderId = interaction.options.getString("order", true);
		const order = await this.modelStore
			.get("order")
			.findOne({
				where: {
					id: orderId,
					deliverer: interaction.user.id
				}
			});

		if (!order) {
			return interaction.editReply({
				embeds: [
					new MessageEmbed({
						color: "RED",
						title: "Invalid order",
						description: "The order you specified does not exist, has not been claimed, or is not claimed by you."
					})
				]
			});
		}

		const method = interaction.options.getString("method", true);

		order.setDataValue("deliveredAt", new Date());

		const deliverer = await this.modelStore.get("user").findByPk(interaction.user.id);
		const deliveryMessage = await this.createDeliveryMessage(deliverer?.deliveryMessage ?? Util.getDefaults().deliveryMessage, order, method === DeliveryMethod.Personal);
		const customer = await order.fetchCustomer();
		const guild = await order.fetchGuild();
		const channel = await order.fetchChannel();

		try {
			switch(method) {
				case DeliveryMethod.Personal:
					await this.deliverPersonal(interaction.user, guild!, channel!, deliveryMessage);
					break;
				case DeliveryMethod.DM:
					await customer!.send(deliveryMessage);
					break;
				case DeliveryMethod.Bot:
					await channel!.send(deliveryMessage);
					break;
			}

			await order.update({
				deliveryMethod: method as DeliveryMethod,
				status: "delivered",
				deliveredAt: order.deliveredAt
			});

			return await interaction.editReply({
				embeds: [
					new MessageEmbed({
						color: "GREEN",
						title: "Order delivered",
						description: `Order ${orderId} has been delivered.`
					})
				]
			});
		} catch (error) {
			return interaction.editReply({
				embeds: [
					new MessageEmbed({
						color: "RED",
						title: "Delivery failed",
						description: `Order ${orderId} could not be delivered.`,
						fields: [{
							name: "Error",
							value: error instanceof Error ? error.message : error as string
						}]
					})
				]
			});
		}
	}

	private async deliverPersonal(user: User, guild: Guild, channel: GuildTextBasedChannel, message: string) {
		if (channel instanceof ThreadChannel) {
			if (!channel.parent) throw new Error("Invalid channel");
			channel = channel.parent;
		}
		const invite = await guild.invites.create(channel, { maxAge: 0, reason: "Delivering an order" });
		await user.send(message);
		await user.send(stripIndents`
			Don't send this link to the customer!
			${invite.url}
		`);
	}
}
