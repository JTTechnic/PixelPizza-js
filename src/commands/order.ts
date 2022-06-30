import { randomInt } from "node:crypto";
import { ApplyOptions } from "@sapphire/decorators";
import type { ApplicationCommandRegistry } from "@sapphire/framework";
import { Time } from "@sapphire/time-utilities";
import { type CommandInteraction, MessageEmbed } from "discord.js";
import { OrderCommand as Command } from "../lib/commands/OrderCommand";

@ApplyOptions<Command.Options>({
	description: "Order some food",
	requiredClientPermissions: ["CREATE_INSTANT_INVITE"],
	preconditions: ["GuildOnly", "GuildTextOnly", "NoOrder", "MaxOrders", "EnoughMoney"],
	cooldownDelay: Time.Hour
})
export class OrderCommand extends Command {
	public override registerApplicationCommands(registry: ApplicationCommandRegistry) {
		registry.registerChatInputCommand(
			this.defaultChatInputCommand.addStringOption((input) =>
				input.setName("order").setDescription("The order you want to place").setRequired(true)
			)
		);
	}

	public override async chatInputRun(interaction: CommandInteraction) {
		await interaction.deferReply({ ephemeral: true });

		await this.getModel("user").update({
			where: { id: interaction.user.id },
			data: {
				balance: {
					decrement: this.container.env.integer("ORDER_PRICE")
				}
			}
		});

		const order = interaction.options.getString("order", true);
		const id = await this.generateOrderID();

		await this.orderModel.create({
			data: {
				id,
				order,
				customer: interaction.user.id,
				guild: interaction.guildId!,
				channel: interaction.channelId
			}
		});

		await interaction.editReply({
			embeds: [
				new MessageEmbed()
					.setColor("GREEN")
					.setTitle("Order Placed")
					.setDescription(`Your order has been placed`)
					.addField("Your order", order)
					.setFooter({ text: `ID: ${id}` })
			]
		});
	}

	private async generateOrderID() {
		const orders = this.getModel("order");
		let id: string;
		do {
			id = `00${randomInt(0, 999)}`.slice(-3);
		} while (await orders.findUnique({ where: { id } }));
		return id;
	}
}
