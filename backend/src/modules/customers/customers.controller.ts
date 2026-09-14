import { Controller, Get, Patch, Body, Param, UseGuards, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiNotFoundResponse, ApiOperation, ApiParam, ApiResponse, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { StoresService } from '../stores/stores.service';
import { UpdateCustomerDto } from './dto/customer.dto';
import { examples, ids } from '../../common/swagger/api-examples';

@ApiTags('Customers')
@ApiBearerAuth()
@Controller('customers')
@UseGuards(JwtAuthGuard)
export class CustomersController {
  constructor(
    private readonly customersService: CustomersService,
    private readonly storesService: StoresService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List customers for the authenticated store' })
  @ApiResponse({ status: 200, description: 'Store customers.', schema: { example: [examples.customer.item] } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: examples.errors.storeNotFound } })
  async findAll(@Request() req) {
    const store = await this.storesService.findByOwner(req.user.id);
    return this.customersService.findAllByStore(store.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get one customer by id' })
  @ApiParam({ name: 'id', example: ids.customer })
  @ApiResponse({ status: 200, description: 'Customer found.', schema: { example: examples.customer.item } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: { message: 'Customer not found', error: 'Not Found', statusCode: 404 } } })
  async findOne(@Param('id') id: string, @Request() req) {
    const store = await this.storesService.findByOwner(req.user.id);
    return this.customersService.findOne(id, store.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update one customer by id' })
  @ApiParam({ name: 'id', example: ids.customer })
  @ApiBody({ type: UpdateCustomerDto, examples: { default: { value: examples.customer.update } } })
  @ApiResponse({ status: 200, description: 'Customer updated.', schema: { example: { ...examples.customer.item, ...examples.customer.update } } })
  @ApiUnauthorizedResponse({ schema: { example: examples.errors.unauthorized } })
  @ApiNotFoundResponse({ schema: { example: { message: 'Customer not found', error: 'Not Found', statusCode: 404 } } })
  async update(@Param('id') id: string, @Body() updateData: UpdateCustomerDto, @Request() req) {
    const store = await this.storesService.findByOwner(req.user.id);
    return this.customersService.update(id, store.id, updateData);
  }
}
